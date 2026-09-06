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

# ---- caption looks --------------------------------------------------------------
# ASS colours are &HAABBGGRR. Brand yellow #FFD52E -> BB=2E GG=D5 RR=FF.
WHITE, BLACK, YELLOW = "&H00FFFFFF", "&H00000000", "&H002ED5FF"

# mode: "highlight" = whole line visible, the spoken word lights up
#       "reveal"    = words appear one by one as they are spoken
#       "static"    = plain line captions
TEMPLATES = {
    "bold":    {"mode": "highlight", "box": True,  "outline": 9, "shadow": 0, "active": YELLOW, "scale": 100},  # outline = box padding
    "reveal":  {"mode": "reveal",    "box": False, "outline": 5, "shadow": 2, "active": WHITE,  "scale": 100},
    "clean":   {"mode": "highlight", "box": False, "outline": 5, "shadow": 2, "active": YELLOW, "scale": 108},
    "classic": {"mode": "static",    "box": False, "outline": 5, "shadow": 2, "active": WHITE,  "scale": 100},
}
DEFAULT_TEMPLATE = "bold"
MAX_WORDS_PER_LINE = 24


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


def clamp_font(value, default: int = 108) -> int:
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(FONT_MIN, min(FONT_MAX, v))


def even_words(text: str, start: float, end: float) -> list:
    """No usable word timings (e.g. the user rewrote the line): spread words evenly."""
    parts = text.split()
    if not parts:
        return []
    step = (end - start) / len(parts)
    return [{"w": w, "s": start + i * step, "e": start + (i + 1) * step} for i, w in enumerate(parts)]


def normalize_words(raw, text: str, start: float, end: float) -> list:
    """
    Per-word timings from the client, sanitized and clamped to the line.
    Falls back to even spacing when missing, malformed, or when the words
    no longer spell the line's text (user edited it).
    """
    if not isinstance(raw, list) or not raw:
        return even_words(text, start, end)
    words = []
    for item in raw[:MAX_WORDS_PER_LINE]:
        if not isinstance(item, dict):
            return even_words(text, start, end)
        w = clean_caption_text(item.get("w", "")).strip()
        try:
            ws, we = float(item.get("s", start)), float(item.get("e", end))
        except (TypeError, ValueError):
            return even_words(text, start, end)
        if not w:
            continue
        words.append({"w": w, "s": min(max(ws, start), end), "e": min(max(we, start), end)})
    if not words or " ".join(x["w"] for x in words) != text:
        return even_words(text, start, end)
    return words


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
        out.append({
            "start": start, "end": end, "text": text,
            "words": normalize_words(item.get("words"), text, start, end),
        })
    return out


def _events_for_line(line: dict, tpl: dict) -> list:
    """(start, end, text-with-overrides) events for one caption line."""
    words = line["words"]
    if tpl["mode"] == "static" or len(words) <= 1:
        return [(line["start"], line["end"], line["text"])]

    active_open = "{\\c" + tpl["active"] + "&"
    if tpl["scale"] != 100:
        active_open += f"\\fscx{tpl['scale']}\\fscy{tpl['scale']}"
    active_open += "}"
    reset = "{\\r}"

    events = []
    for i, w in enumerate(words):
        seg_start = max(line["start"], w["s"]) if i else line["start"]
        seg_end = words[i + 1]["s"] if i + 1 < len(words) else line["end"]
        if seg_end <= seg_start:
            continue
        if tpl["mode"] == "reveal":
            text = " ".join(x["w"] for x in words[: i + 1])
        else:  # highlight
            text = " ".join(
                (active_open + x["w"] + reset) if j == i else x["w"]
                for j, x in enumerate(words)
            )
        events.append((seg_start, seg_end, text))
    return events


def build_ass(lines: list, template: str, font_size: int = 108) -> str:
    tpl = TEMPLATES.get(template, TEMPLATES[DEFAULT_TEMPLATE])
    border_style = 4 if tpl["box"] else 1
    back = "&H9A000000" if tpl["box"] else "&H80000000"
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Noto Sans Hebrew,{font_size},{WHITE},{WHITE},{BLACK},{back},-1,0,0,0,100,100,0,0,{border_style},{tpl['outline']},{tpl['shadow']},2,70,70,480,177

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for line in lines:
        for start, end, text in _events_for_line(line, tpl):
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Cap,,0,0,0,,{text}\n")
    return header + "".join(events)


def check_key(provided, expected) -> bool:
    """Constant-time key check. Accepts str or bytes; tolerates surrounding whitespace."""
    import hmac
    if isinstance(provided, bytes):
        provided = provided.decode("utf-8", "ignore")
    if not isinstance(provided, str) or not expected:
        return False
    return hmac.compare_digest(provided.strip().encode(), str(expected).strip().encode())


async def form_key(form):
    """api_key from a multipart form; some clients send text parts as file parts."""
    v = form.get("api_key")
    if v is not None and not isinstance(v, (str, bytes)) and hasattr(v, "read"):
        v = await v.read()
    return v


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


HDR_TRANSFERS = {"arib-std-b67", "smpte2084"}  # HLG, PQ — iPhone HDR video


def is_hdr(color_transfer, pix_fmt) -> bool:
    """10-bit or HDR-transfer sources must be tone-mapped to 8-bit SDR: iOS cannot
    decode H.264 High 10, so a naive burn plays BLACK with sound (found 2026-09-06)."""
    return (color_transfer or "") in HDR_TRANSFERS or "10" in (pix_fmt or "")


def video_filter(width: int, ass_path: str, hdr: bool) -> str:
    """Scale → (HDR: tone-map to bt709) → 8-bit → burn subtitles last so they stay full-bright."""
    chain = [f"scale={width}:-2"]
    if hdr:
        chain += [
            "zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709",
            "tonemap=tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv",
        ]
    chain += ["format=yuv420p", f"subtitles={ass_path}"]
    return ",".join(chain)


def _probe_video(path: str) -> dict:
    """{'duration': float (-1 if unreadable), 'hdr': bool} via ffprobe."""
    import json, subprocess
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "format=duration:stream=color_transfer,pix_fmt",
         "-of", "json", path],
        capture_output=True, text=True, timeout=60,
    )
    try:
        info = json.loads(out.stdout or "{}")
        duration = float(info.get("format", {}).get("duration", -1))
    except (ValueError, TypeError):
        return {"duration": -1.0, "hdr": False}
    streams = info.get("streams") or [{}]
    return {"duration": duration, "hdr": is_hdr(streams[0].get("color_transfer"), streams[0].get("pix_fmt"))}


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
        provided = await form_key(form)
        if not check_key(provided, os.environ.get("KATUVIT_API_KEY")):
            # diagnostic only: type + length, never the value
            print(
                "upload auth failed:",
                f"type={type(provided).__name__}",
                f"fields={list(form.keys())}",
                f"content-type={request.headers.get('content-type')!r}",
                f"content-length={request.headers.get('content-length')!r}",
            )
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

        duration = _probe_video(src)["duration"]
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

        template = req.get("template") if req.get("template") in TEMPLATES else DEFAULT_TEMPLATE
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
                hdr = _probe_video(src)["hdr"]
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "error", "-i", src,
                     "-vf", video_filter(width, ass_path, hdr),
                     # 8-bit High profile + bt709 tags: decodable everywhere (iOS chokes on High 10)
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                     "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
                     "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                     "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
                    check=True, timeout=FFMPEG_TIMEOUT_S,
                )
                with open(out, "rb") as f:
                    data = f.read()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return _json({"error": "burn_failed"}, 500)

        return Response(content=data, media_type="video/mp4")


# the module imports fastapi at top level, so every function in this file needs it
cleanup_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")


@app.function(image=cleanup_image, schedule=modal.Period(hours=1), volumes={"/media": media})
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
