"""
Katuvit worker — Google Cloud Run (GPU L4), same GCP project as Firebase.

Flow (the app never streams video through this service):
  POST /upload-url  {api_key}                     -> {media_id, upload_url}  signed PUT to Cloud Storage
  POST /transcribe  {api_key, media_id}           -> {segments, duration, media_id}
  POST /burn        {api_key, media_id, template, lines, quality, font_size}
                                                  -> {download_url, bytes}   signed GET to Cloud Storage
  GET  /health
Media lives in the bucket under src/ and out/; a bucket lifecycle rule deletes it after 1 day.
"""
import os
import subprocess
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta

import google.auth
from fastapi import Body, FastAPI
from fastapi.responses import JSONResponse
from google.auth.transport import requests as google_requests
from google.cloud import storage

from captions import (
    DEFAULT_TEMPLATE,
    FFMPEG_TIMEOUT_S,
    MAX_DURATION_S,
    MAX_UPLOAD_BYTES,
    MEDIA_ID_RE,
    MODEL_ID,
    TEMPLATES,
    build_ass,
    check_key,
    clamp_font,
    normalize_lines,
    probe_video,
    video_filter,
)

BUCKET = os.environ.get("MEDIA_BUCKET", "")
API_KEY = os.environ.get("KATUVIT_API_KEY", "")
SIGNED_PUT_MINUTES = 30
SIGNED_GET_MINUTES = 120
UPLOAD_CONTENT_TYPE = "application/octet-stream"

_model = None


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(
            MODEL_ID,
            device=os.environ.get("WHISPER_DEVICE", "cuda"),
            compute_type=os.environ.get("WHISPER_COMPUTE", "float16"),
        )
    return _model


@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("PRELOAD_MODEL", "1") == "1":
        get_model()  # ~20-40s once per instance; the model weights are baked into the image
    yield


app = FastAPI(title="katuvit-worker", lifespan=lifespan)


# ---- storage helpers -----------------------------------------------------------
def _bucket():
    return storage.Client().bucket(BUCKET)


def _signer_kwargs() -> dict:
    """On Cloud Run there is no key file: sign with the runtime service account via IAM."""
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(google_requests.Request())
    email = getattr(creds, "service_account_email", None)
    if not email or email == "default":
        import urllib.request
        req = urllib.request.Request(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email",
            headers={"Metadata-Flavor": "Google"},
        )
        email = urllib.request.urlopen(req, timeout=2).read().decode()
    return {"service_account_email": email, "access_token": creds.token}


def signed_url(blob, method: str, minutes: int, content_type: str | None = None) -> str:
    kwargs = {"version": "v4", "expiration": timedelta(minutes=minutes), "method": method}
    if content_type:
        kwargs["content_type"] = content_type
    try:
        kwargs.update(_signer_kwargs())
    except Exception:
        pass  # local dev with a service-account key file: the library signs by itself
    return blob.generate_signed_url(**kwargs)


def _err(code: str, status: int, **extra):
    return JSONResponse({"error": code, **extra}, status_code=status)


def _authorized(body: dict) -> bool:
    return isinstance(body, dict) and check_key(body.get("api_key"), API_KEY)


def _valid_media_id(body: dict) -> str | None:
    media_id = str(body.get("media_id", ""))
    return media_id if MEDIA_ID_RE.match(media_id) else None


# ---- endpoints -------------------------------------------------------------------
@app.get("/health")  # not /healthz: Google's frontend intercepts that path and answers 404 itself
def healthz():
    return {"ok": True, "model_loaded": _model is not None, "bucket": bool(BUCKET)}


@app.post("/upload-url")
def upload_url(body: dict = Body(...)):
    if not _authorized(body):
        return _err("unauthorized", 401)
    media_id = uuid.uuid4().hex
    blob = _bucket().blob(f"src/{media_id}")
    return {
        "media_id": media_id,
        "upload_url": signed_url(blob, "PUT", SIGNED_PUT_MINUTES, UPLOAD_CONTENT_TYPE),
        "content_type": UPLOAD_CONTENT_TYPE,
        "max_bytes": MAX_UPLOAD_BYTES,
        "expires_in_minutes": SIGNED_PUT_MINUTES,
    }


@app.post("/transcribe")
def transcribe(body: dict = Body(...)):
    if not _authorized(body):
        return _err("unauthorized", 401)
    media_id = _valid_media_id(body)
    if not media_id:
        return _err("bad_media_id", 400)

    blob = _bucket().blob(f"src/{media_id}")
    if not blob.exists():
        return _err("media_not_found", 404)
    blob.reload()
    if (blob.size or 0) > MAX_UPLOAD_BYTES:
        blob.delete()
        return _err("too_large", 413, max_mb=MAX_UPLOAD_BYTES // (1024 * 1024))

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "src.mov")
        blob.download_to_filename(src)
        info = probe_video(src)
        if info["duration"] < 0:
            blob.delete()
            return _err("unreadable_media", 400)
        if info["duration"] > MAX_DURATION_S:
            blob.delete()
            return _err("too_long", 413, max_seconds=MAX_DURATION_S)
        wav = os.path.join(td, "audio.wav")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wav],
                check=True, timeout=FFMPEG_TIMEOUT_S,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return _err("decode_failed", 422)
        segments, meta = get_model().transcribe(wav, word_timestamps=True, vad_filter=True)
        out = [
            {
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
                "words": [{"w": w.word, "s": round(w.start, 2), "e": round(w.end, 2)} for w in (seg.words or [])],
            }
            for seg in segments
        ]
    return {"segments": out, "duration": round(meta.duration, 1), "media_id": media_id}


@app.post("/burn")
def burn(body: dict = Body(...)):
    if not _authorized(body):
        return _err("unauthorized", 401)
    media_id = _valid_media_id(body)
    if not media_id:
        return _err("bad_media_id", 400)
    try:
        lines = normalize_lines(body.get("lines"))
    except ValueError:
        return _err("bad_lines", 400)
    if not lines:
        return _err("no_lines", 400)
    template = body.get("template") if body.get("template") in TEMPLATES else DEFAULT_TEMPLATE
    font_size = clamp_font(body.get("font_size"))
    width = 720 if body.get("quality") == "720p" else 1080

    bucket = _bucket()
    src_blob = bucket.blob(f"src/{media_id}")
    if not src_blob.exists():
        return _err("media_not_found", 404)

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "src.mov")
        src_blob.download_to_filename(src)
        hdr = probe_video(src)["hdr"]
        ass_path = os.path.join(td, "captions.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(build_ass(lines, template, font_size))
        out = os.path.join(td, "out.mp4")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src,
                 "-vf", video_filter(width, ass_path, hdr),
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                 "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
                 "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                 "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out],
                check=True, timeout=FFMPEG_TIMEOUT_S,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return _err("burn_failed", 500)
        out_blob = bucket.blob(f"out/{media_id}-{uuid.uuid4().hex[:8]}.mp4")
        out_blob.upload_from_filename(out, content_type="video/mp4")
        size = os.path.getsize(out)

    return {
        "download_url": signed_url(out_blob, "GET", SIGNED_GET_MINUTES),
        "bytes": size,
        "expires_in_minutes": SIGNED_GET_MINUTES,
    }
