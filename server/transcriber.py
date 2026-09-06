"""
Katuvit transcription + caption-burn service — Modal serverless GPU.
Deploy:  modal deploy server/transcriber.py
Cost: pay-per-second GPU (L4), scales to zero when idle.

Endpoints (all require api_key):
  POST upload  multipart file=<video>            -> {segments, duration, media_id}
  POST burn    {media_id, template, lines, ...}  -> video/mp4 bytes
Scheduled:
  cleanup_media  hourly, deletes media older than RETENTION_HOURS (privacy promise: 24h)
"""
import re

import modal
from fastapi import Request

MODEL_ID = "ivrit-ai/whisper-large-v3-ct2"

# ---- limits (abuse / cost / memory guards) -----------------------------------
MAX_UPLOAD_BYTES = 400 * 1024 * 1024   # 400 MB
MAX_DURATION_S = 185                    # app caps picks at 180s
MAX_LINES = 3000
MAX_TEXT_CHARS = 200
FONT_MIN, FONT_MAX = 40, 160
RETENTION_HOURS = 24
FFMPEG_TIMEOUT_S = 240                  # stay under Modal's 300s request timeout

MEDIA_ID_RE = re.compile(r"^[0-9a-f]{32}\Z")  # \Z: "$" would accept a trailing newline

app = modal.App("katuvit-transcriber")

# uploaded videos live here between upload and burn; cleanup_media purges them
media = modal.Volume.from_name("katuvit-media", create_if_missing=True)

# caption style -> ASS style values (colors are ASS &HAABBGGRR)
ASS_STYLES = {
    "classic": "&H00FFFFFF,&H00FFFFFF,&H00000000,&H88000000,-1,1,5,2",
    "boxed": "&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,-1,4,0,0",
    "yellow": "&H003DE2FF,&H003DE2FF,&H00000000,&H88000000,-1,1,5,2",
    "pop": "&H00FFFFFF,&H00FFFFFF,&H006C30E1,&H88000000,-1,1,5,2",
    "clean": "&H00111111,&H00111111,&H00FFFFFF,&H30FFFFFF,-1,4,0,0",
}


# ---- pure helpers (unit-tested in test_transcriber.py) -----------------------
def ass_time(t: float) -> str:
    """seconds -> H:MM:SS.cc (centiseconds, never emits '60.00')."""
    cs = max(0, int(round(float(t) * 100)))
    h, rem = divmod(cs, 360_000)
    m, rem = divmod(rem, 6_000)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def clean_caption_text(text) -> str:
    """
    Neutralize ASS markup: '{...}' override blocks and backslash escapes
    (\\N, \\h, tags) would let caption text alter rendering or break the file.
    Newlines/tabs collapse to single spaces; length is capped.
    """
    t = str(text).replace("{", "").replace("}", "").replace("\\", "＼")
    t = " ".join(t.split())
    return t[:MAX_TEXT_CHARS]


def clamp_font(value, default: int = 88) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(FONT_MIN, min(FONT_MAX, v))


def normalize_lines(raw) -> list:
    """Validate the client's caption lines; drop malformed ones; cap the count."""
    if not isinstance(raw, list):
        raise ValueError("lines must be a list")
    out = []
    for item in raw[:MAX_LINES]:
        if not isinstance(item, dict):
            continue
        try:
            start = float(item.get("start", 0))
            end = float(item.get("end", 0))
        except (TypeError, ValueError):
            continue
        text = clean_caption_text(item.get("text", ""))
        if not text or end <= start:
            continue
        out.append({"start": start, "end": end, "text": text})
    return out


def build_ass(lines: list, template: str, font_size: int = 88) -> str:
    vals = ASS_STYLES.get(template, ASS_STYLES["classic"])
    primary, secondary, outline_c, back, bold, border_style, outline_w, shadow = (
        vals.split(",")
    )
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Noto Sans Hebrew,{font_size},{primary},{secondary},{outline_c},{back},{bold},0,0,0,100,100,0,0,{border_style},{outline_w},{shadow},2,60,60,340,177

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = "".join(
        f"Dialogue: 0,{ass_time(l['start'])},{ass_time(l['end'])},Cap,,0,0,0,,{l['text']}\n"
        for l in lines
    )
    return header + events


def check_key(provided, expected) -> bool:
    import hmac
    if not isinstance(provided, str) or not expected:
        return False
    return hmac.compare_digest(provided.encode(), expected.encode())


# ---- image -------------------------------------------------------------------
image = (
    # CUDA runtime base: ctranslate2 (faster-whisper) needs cuBLAS 12 + cuDNN 9
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.12"
    )
    .apt_install("ffmpeg", "fonts-noto-core", "fontconfig")
    .run_commands("fc-cache -f")
    .pip_install("faster-whisper==1.2.1", "huggingface_hub", "fastapi[standard]", "python-multipart")
    # bake the model into the image so cold starts don't re-download 1.6GB
    .run_commands(
        "python -c \"from huggingface_hub import snapshot_download; "
        f"snapshot_download('{MODEL_ID}')\""
    )
)


def _json(payload: dict, status: int):
    from fastapi.responses import JSONResponse
    return JSONResponse(payload, status_code=status)


def _probe_duration(path: str) -> float:
    import subprocess
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, timeout=60,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return -1.0


@app.cls(
    image=image,
    gpu="L4",
    scaledown_window=60,  # release GPU 60s after last request
    secrets=[modal.Secret.from_name("katuvit-api-key")],  # KATUVIT_API_KEY
    volumes={"/media": media},
)
class Transcriber:
    @modal.enter()
    def load(self):
        from faster_whisper import WhisperModel
        self.model = WhisperModel(MODEL_ID, device="cuda", compute_type="float16")

    def _package(self, audio_path: str):
        segments, info = self.model.transcribe(
            audio_path, word_timestamps=True, vad_filter=True
        )
        out = []
        for seg in segments:
            out.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
                "words": [
                    {"w": w.word, "s": round(w.start, 2), "e": round(w.end, 2)}
                    for w in (seg.words or [])
                ],
            })
        return {"segments": out, "duration": round(info.duration, 1)}

    @modal.fastapi_endpoint(method="POST")
    async def upload(self, request: Request):
        """
        multipart/form-data: file=<video or audio>, api_key=<key>
        Streams to the volume (size-capped), checks duration, transcribes.
        """
        import os, subprocess, tempfile, uuid

        form = await request.form()
        if not check_key(form.get("api_key"), os.environ.get("KATUVIT_API_KEY")):
            return _json({"error": "unauthorized"}, 401)

        upload_file = form.get("file")
        if upload_file is None or not hasattr(upload_file, "read"):
            return _json({"error": "missing_file"}, 400)

        media_id = uuid.uuid4().hex
        src = f"/media/{media_id}.mov"
        written = 0
        with open(src, "wb") as f:
            while chunk := await upload_file.read(8 * 1024 * 1024):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    f.close()
                    os.remove(src)
                    return _json({"error": "too_large", "max_mb": MAX_UPLOAD_BYTES // (1024 * 1024)}, 413)
                f.write(chunk)

        duration = _probe_duration(src)
        if duration < 0:
            os.remove(src)
            return _json({"error": "unreadable_media"}, 400)
        if duration > MAX_DURATION_S:
            os.remove(src)
            return _json({"error": "too_long", "max_seconds": MAX_DURATION_S}, 413)
        media.commit()

        try:
            with tempfile.TemporaryDirectory() as td:
                wav = os.path.join(td, "audio.wav")
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "error", "-i", src,
                     "-vn", "-ac", "1", "-ar", "16000", wav],
                    check=True, timeout=FFMPEG_TIMEOUT_S,
                )
                result = self._package(wav)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return _json({"error": "decode_failed"}, 422)

        result["media_id"] = media_id
        return result

    @modal.fastapi_endpoint(method="POST")
    def burn(self, req: dict):
        """
        POST {"api_key", "media_id", "template", "lines": [{"start","end","text"}],
              "quality": "1080p"|"720p", "font_size": int}
        -> the burned MP4 (video/mp4 bytes)
        """
        import os, subprocess, tempfile

        from fastapi.responses import Response

        if not isinstance(req, dict):
            return _json({"error": "bad_request"}, 400)
        if not check_key(req.get("api_key"), os.environ.get("KATUVIT_API_KEY")):
            return _json({"error": "unauthorized"}, 401)

        media_id = str(req.get("media_id", ""))
        if not MEDIA_ID_RE.match(media_id):
            return _json({"error": "bad_media_id"}, 400)

        try:
            lines = normalize_lines(req.get("lines"))
        except ValueError:
            return _json({"error": "bad_lines"}, 400)
        if not lines:
            return _json({"error": "no_lines"}, 400)

        template = req.get("template") if req.get("template") in ASS_STYLES else "classic"
        font_size = clamp_font(req.get("font_size"))
        width = 720 if req.get("quality") == "720p" else 1080

        media.reload()  # ensure the uploaded source is visible in this container
        src = f"/media/{media_id}.mov"
        if not os.path.exists(src):
            return _json({"error": "media_not_found"}, 404)

        try:
            with tempfile.TemporaryDirectory() as td:
                ass_path = os.path.join(td, "captions.ass")
                with open(ass_path, "w", encoding="utf-8") as f:
                    f.write(build_ass(lines, template, font_size))
                out = os.path.join(td, "out.mp4")
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "error", "-i", src,
                     "-vf", f"scale={width}:-2,subtitles={ass_path}",
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                     "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
                    check=True, timeout=FFMPEG_TIMEOUT_S,
                )
                with open(out, "rb") as f:
                    data = f.read()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return _json({"error": "burn_failed"}, 500)

        return Response(content=data, media_type="video/mp4")


@app.function(schedule=modal.Period(hours=1), volumes={"/media": media})
def cleanup_media():
    """Delete uploaded media older than RETENTION_HOURS — backs the privacy policy."""
    import os, time

    media.reload()
    cutoff = time.time() - RETENTION_HOURS * 3600
    removed = 0
    for name in os.listdir("/media"):
        path = os.path.join("/media", name)
        try:
            if os.path.isfile(path) and os.stat(path).st_mtime < cutoff:
                os.remove(path)
                removed += 1
        except FileNotFoundError:
            continue
    media.commit()
    print(f"cleanup_media: removed {removed} file(s) older than {RETENTION_HOURS}h")
