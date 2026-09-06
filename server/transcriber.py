"""
Katuvit transcription service — Modal serverless GPU.
Deploy:  modal deploy server/transcriber.py
Cost: pay-per-second GPU (L4), scales to zero when idle.
"""
import modal
from fastapi import Request

MODEL_ID = "ivrit-ai/whisper-large-v3-ct2"

app = modal.App("katuvit-transcriber")

image = (
    # CUDA runtime base: ctranslate2 (faster-whisper) needs cuBLAS 12 + cuDNN 9
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.12"
    )
    .apt_install("ffmpeg")
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

        upload_file = form["file"]
        with tempfile.TemporaryDirectory() as td:
            src = os.path.join(td, "input.media")
            with open(src, "wb") as f:
                while chunk := await upload_file.read(8 * 1024 * 1024):
                    f.write(chunk)
            wav = os.path.join(td, "audio.wav")
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src,
                 "-vn", "-ac", "1", "-ar", "16000", wav],
                check=True,
            )
            return self._package(wav)

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
