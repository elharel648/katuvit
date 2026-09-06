"""
Katuvit transcription service — Modal serverless GPU.
Deploy:  modal deploy server/transcriber.py
Cost: pay-per-second GPU (L4), scales to zero when idle.
"""
import modal
from fastapi import Request

MODEL_ID = "ivrit-ai/whisper-large-v3-ct2"

app = modal.App("katuvit-transcriber")

# uploaded videos live here between transcribe and burn (cleaned by daily job)
media = modal.Volume.from_name("katuvit-media", create_if_missing=True)

# caption style -> ASS style line values (colors are ASS &HAABBGGRR)
ASS_STYLES = {
    "classic": "&H00FFFFFF,&H00FFFFFF,&H00000000,&H88000000,-1,1,5,2",
    "boxed": "&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,-1,4,0,0",
    "yellow": "&H003DE2FF,&H003DE2FF,&H00000000,&H88000000,-1,1,5,2",
    "pop": "&H00FFFFFF,&H00FFFFFF,&H006C30E1,&H88000000,-1,1,5,2",
    "clean": "&H00111111,&H00111111,&H00FFFFFF,&H30FFFFFF,-1,4,0,0",
}


def build_ass(lines: list, template: str) -> str:
    vals = ASS_STYLES.get(template, ASS_STYLES["classic"])
    primary, secondary, outline_c, back, bold, border_style, outline_w, shadow = (
        vals.split(",")
    )

    def ts(t: float) -> str:
        h, m = int(t // 3600), int(t % 3600 // 60)
        return f"{h}:{m:02d}:{t % 60:05.2f}"

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Noto Sans Hebrew,88,{primary},{secondary},{outline_c},{back},{bold},0,0,0,100,100,0,0,{border_style},{outline_w},{shadow},2,60,60,340,177

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = "".join(
        f"Dialogue: 0,{ts(l['start'])},{ts(l['end'])},Cap,,0,0,0,,{l['text']}\n"
        for l in lines
        if l.get("text", "").strip()
    )
    return header + events

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
        Extracts audio with ffmpeg, transcribes, returns segments JSON.
        """
        import os, subprocess, tempfile

        form = await request.form()
        if form.get("api_key") != os.environ["KATUVIT_API_KEY"]:
            return {"error": "unauthorized"}

        import uuid

        upload_file = form["file"]
        media_id = uuid.uuid4().hex
        src = f"/media/{media_id}.mov"
        with open(src, "wb") as f:
            while chunk := await upload_file.read(8 * 1024 * 1024):
                f.write(chunk)
        media.commit()

        with tempfile.TemporaryDirectory() as td:
            wav = os.path.join(td, "audio.wav")
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src,
                 "-vn", "-ac", "1", "-ar", "16000", wav],
                check=True,
            )
            result = self._package(wav)
        result["media_id"] = media_id
        return result

    @modal.fastapi_endpoint(method="POST")
    def burn(self, req: dict):
        """
        POST {"api_key", "media_id", "template", "lines": [{"start","end","text"}]}
        -> the burned MP4 (video/mp4 bytes)
        """
        import os, subprocess, tempfile

        from fastapi.responses import Response

        if req.get("api_key") != os.environ["KATUVIT_API_KEY"]:
            return {"error": "unauthorized"}

        media.reload()
        src = f"/media/{req['media_id']}.mov"
        if not os.path.exists(src):
            return {"error": "media_not_found"}

        with tempfile.TemporaryDirectory() as td:
            ass_path = os.path.join(td, "captions.ass")
            with open(ass_path, "w", encoding="utf-8") as f:
                f.write(build_ass(req["lines"], req.get("template", "classic")))
            out = os.path.join(td, "out.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src,
                 "-vf", f"scale=1080:-2,subtitles={ass_path}",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                 "-c:a", "aac", "-b:a", "128k", out],
                check=True,
            )
            with open(out, "rb") as f:
                data = f.read()
        return Response(content=data, media_type="video/mp4")

    @modal.fastapi_endpoint(method="POST")
    def transcribe(self, req: dict):
        """
        POST {"api_key": "...", "audio_url": "<presigned url>"} OR {"api_key": "...", "audio_b64": "<base64>"}
        -> {"segments": [{"start","end","text","words":[{"w","s","e"},...]}, ...], "duration": float}
        No language forcing — the model handles Hebrew-English code-switching (verified in PoC).
        """
        import base64, os, tempfile, urllib.request

        if req.get("api_key") != os.environ["KATUVIT_API_KEY"]:
            return {"error": "unauthorized"}, 401

        with tempfile.NamedTemporaryFile(suffix=".audio") as tmp:
            if req.get("audio_b64"):
                tmp.write(base64.b64decode(req["audio_b64"]))
                tmp.flush()
            else:
                urllib.request.urlretrieve(req["audio_url"], tmp.name)
            segments, info = self.model.transcribe(
                tmp.name, word_timestamps=True, vad_filter=True
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
