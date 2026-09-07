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
import re
import subprocess
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta

import time

import firebase_admin
import google.auth
from fastapi import Body, FastAPI, Header
from fastapi.responses import JSONResponse
from firebase_admin import auth as fb_auth
from firebase_admin import firestore as fb_firestore
from google.auth.transport import requests as google_requests
from google.cloud import storage

from captions import (
    FFMPEG_TIMEOUT_S,
    MAX_DURATION_S,
    MAX_UPLOAD_BYTES,
    MEDIA_ID_RE,
    MODEL_ID,
    TEMPLATES,
    FREE_LIFETIME_VIDEOS,
    PRO_MONTHLY_VIDEOS,
    build_ass,
    canvas_for,
    check_key,
    drop_hallucinations,
    fix_prefix_gap,
    hints_prompt,
    merge_prefix_words,
    sanitize_hints,
    clamp_font,
    consume,
    normalize_lines,
    probe_video,
    quota_decision,
    strip_fillers,
    style_options,
    video_filter,
)

BUCKET = os.environ.get("MEDIA_BUCKET", "")
API_KEY = os.environ.get("KATUVIT_API_KEY", "")
SIGNED_PUT_MINUTES = 30
SIGNED_GET_MINUTES = 120
UPLOAD_CONTENT_TYPE = "application/octet-stream"
# every request must carry a Firebase ID token; the shared api_key stays as a second lock
REQUIRE_AUTH = os.environ.get("REQUIRE_AUTH", "1") == "1"

_model = None
_fb_app = None
_db = None


def db():
    global _fb_app, _db
    if _db is None:
        _fb_app = firebase_admin.initialize_app()  # ADC on Cloud Run (runtime service account)
        _db = fb_firestore.client()
    return _db


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


class AuthError(Exception):
    def __init__(self, code: str, status: int = 401):
        super().__init__(code)
        self.code, self.status = code, status


def _uid(authorization: str | None) -> str | None:
    """uid from 'Authorization: Bearer <Firebase ID token>'; None when auth is optional and absent."""
    if not authorization or not authorization.lower().startswith("bearer "):
        if REQUIRE_AUTH:
            raise AuthError("auth_required")
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        db()  # ensure firebase_admin is initialised
        return fb_auth.verify_id_token(token)["uid"]
    except Exception:
        raise AuthError("bad_token")


def _user_ref(uid: str):
    return db().collection("users").document(uid)


def _load_user(uid: str) -> dict:
    snap = _user_ref(uid).get()
    if snap.exists:
        return snap.to_dict() or {}
    fresh = {"plan": "free", "credits": 0, "free_used": 0, "monthly_used": 0,
             "videos_total": 0, "created_at": time.time()}
    _user_ref(uid).set(fresh)
    return fresh


def _consume_in_transaction(uid: str, kind: str) -> tuple[dict, str]:
    """Re-check and consume atomically so two parallel uploads can't both pass."""
    transaction = db().transaction()
    ref = _user_ref(uid)

    @fb_firestore.transactional
    def run(tx):
        snap = ref.get(transaction=tx)
        user = snap.to_dict() if snap.exists else {}
        allowed, k = quota_decision(user, time.time())
        if not allowed:
            raise AuthError("quota_exceeded", 402)
        updated = consume(user, k)
        tx.set(ref, updated, merge=True)
        return updated, k

    return run(transaction)


def _entitlements(user: dict) -> dict:
    now = time.time()
    pro_active = user.get("plan") == "pro" and float(user.get("pro_until") or 0) > now
    return {
        "plan": "pro" if pro_active else "free",
        "pro_until": user.get("pro_until"),
        "credits": int(user.get("credits") or 0),
        "free_used": int(user.get("free_used") or 0),
        "free_left": max(0, FREE_LIFETIME_VIDEOS - int(user.get("free_used") or 0)),
        "monthly_used": int(user.get("monthly_used") or 0),
        "monthly_cap": PRO_MONTHLY_VIDEOS,
        "videos_total": int(user.get("videos_total") or 0),
    }


def _valid_media_id(body: dict) -> str | None:
    media_id = str(body.get("media_id", ""))
    return media_id if MEDIA_ID_RE.match(media_id) else None


# ---- endpoints -------------------------------------------------------------------
@app.get("/health")  # not /healthz: Google's frontend intercepts that path and answers 404 itself
def healthz():
    return {"ok": True, "model_loaded": _model is not None, "bucket": bool(BUCKET)}


@app.post("/me")
def me(body: dict = Body(...), authorization: str | None = Header(default=None)):
    """Entitlements for the signed-in user (creates the user document on first call)."""
    if not _authorized(body):
        return _err("unauthorized", 401)
    try:
        uid = _uid(authorization)
    except AuthError as e:
        return _err(e.code, e.status)
    return _entitlements(_load_user(uid))


@app.post("/delete-account")
def delete_account(body: dict = Body(...), authorization: str | None = Header(default=None)):
    """Apple requires in-app account deletion: user doc, media records, then the auth user."""
    if not _authorized(body):
        return _err("unauthorized", 401)
    try:
        uid = _uid(authorization)
    except AuthError as e:
        return _err(e.code, e.status)
    for snap in db().collection("media").where("uid", "==", uid).stream():
        snap.reference.delete()
    _user_ref(uid).delete()
    try:
        fb_auth.delete_user(uid)
    except Exception:
        pass  # already gone
    return {"ok": True}


@app.post("/upload-url")
def upload_url(body: dict = Body(...), authorization: str | None = Header(default=None)):
    if not _authorized(body):
        return _err("unauthorized", 401)
    try:
        uid = _uid(authorization)
    except AuthError as e:
        return _err(e.code, e.status)
    # refuse early, before the user uploads 50MB for nothing
    allowed, kind = quota_decision(_load_user(uid), time.time())
    if not allowed:
        return _err("quota_exceeded", 402, **_entitlements(_load_user(uid)))
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
def transcribe(body: dict = Body(...), authorization: str | None = Header(default=None)):
    if not _authorized(body):
        return _err("unauthorized", 401)
    try:
        uid = _uid(authorization)
    except AuthError as e:
        return _err(e.code, e.status)
    media_id = _valid_media_id(body)
    if not media_id:
        return _err("bad_media_id", 400)
    allowed, _kind = quota_decision(_load_user(uid), time.time())
    if not allowed:
        return _err("quota_exceeded", 402, **_entitlements(_load_user(uid)))

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
        hints = sanitize_hints(body.get("hints"))
        segments, meta = get_model().transcribe(
            wav,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            # short clips: fresh context per window costs little and kills repetition loops
            condition_on_previous_text=False,
            initial_prompt=hints_prompt(hints),
        )
        out = [
            {
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": fix_prefix_gap(seg.text.strip()),
                "words": merge_prefix_words(
                    [{"w": w.word, "s": round(w.start, 2), "e": round(w.end, 2)} for w in (seg.words or [])]
                ),
                "no_speech_prob": seg.no_speech_prob,
                "avg_logprob": seg.avg_logprob,
                "compression_ratio": seg.compression_ratio,
            }
            for seg in segments
        ]
    out = strip_fillers(drop_hallucinations(out))
    # success → pay for it atomically and remember who owns this media (and whether it's free-tier)
    try:
        updated, paid_with = _consume_in_transaction(uid, _kind)
    except AuthError as e:
        return _err(e.code, e.status)
    db().collection("media").document(media_id).set({
        "uid": uid, "created_at": time.time(), "paid_with": paid_with,
        "watermark": paid_with == "free", "duration": round(meta.duration, 1),
    })
    return {"segments": out, "duration": round(meta.duration, 1), "media_id": media_id,
            "entitlements": _entitlements(updated)}


EVENT_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
EVENTS_PER_DAY = 400


@app.post("/event")
def event(body: dict = Body(...), authorization: str | None = Header(default=None)):
    """
    Funnel + error telemetry from the app. Tiny on purpose: one Firestore doc per event, capped per
    user per day, values truncated. This is the only feedback channel — the user does not talk to users.
    """
    if not _authorized(body):
        return _err("unauthorized", 401)
    try:
        uid = _uid(authorization)
    except AuthError as e:
        return _err(e.code, e.status)
    name = body.get("name")
    if not isinstance(name, str) or not EVENT_NAME_RE.match(name):
        return _err("bad_event", 400)
    raw_props = body.get("props") if isinstance(body.get("props"), dict) else {}
    props = {}
    for k, v in list(raw_props.items())[:12]:
        if not isinstance(k, str) or not EVENT_NAME_RE.match(k):
            continue
        if isinstance(v, bool) or isinstance(v, (int, float)):
            props[k] = v
        elif isinstance(v, str):
            props[k] = v[:400]
    day = time.strftime("%Y-%m-%d", time.gmtime())
    ref = _user_ref(uid)

    @fb_firestore.transactional
    def _count(tx):
        snap = ref.get(transaction=tx)
        u = snap.to_dict() if snap.exists else {}
        n = int(u.get("ev_count") or 0) if u.get("ev_day") == day else 0
        if n >= EVENTS_PER_DAY:
            return False
        tx.set(ref, {"ev_day": day, "ev_count": n + 1}, merge=True)
        return True

    if not _count(db().transaction()):
        return _err("too_many_events", 429)
    db().collection("events").add({
        "uid": uid, "name": name, "props": props, "ts": time.time(), "day": day,
        "app": str(body.get("app") or "")[:40],
    })
    return {"ok": True}


@app.post("/burn")
def burn(body: dict = Body(...), authorization: str | None = Header(default=None)):
    if not _authorized(body):
        return _err("unauthorized", 401)
    try:
        uid = _uid(authorization)
    except AuthError as e:
        return _err(e.code, e.status)
    media_id = _valid_media_id(body)
    if not media_id:
        return _err("bad_media_id", 400)
    media_doc = db().collection("media").document(media_id).get()
    media = media_doc.to_dict() if media_doc.exists else None
    if not media or media.get("uid") != uid:
        return _err("media_not_found", 404)
    watermark = bool(media.get("watermark"))
    try:
        lines = normalize_lines(body.get("lines"))
    except ValueError:
        return _err("bad_lines", 400)
    if not lines:
        return _err("no_lines", 400)
    style = style_options(body)
    font_size = clamp_font(body.get("font_size"))
    quality = "720p" if body.get("quality") == "720p" else "1080p"
    width, height = canvas_for(style["format"], quality)

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
            f.write(build_ass(
                lines, style["template"], font_size, watermark=watermark,
                accent=style["accent"], font=style["font"], position=style["position"], animation=style["animation"],
                pos_x=style["pos_x"], pos_y=style["pos_y"], fmt=style["format"],
            ))
        out = os.path.join(td, "out.mp4")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", src,
                 "-vf", video_filter(width, ass_path, hdr, height),
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
        "watermark": watermark,
        "expires_in_minutes": SIGNED_GET_MINUTES,
    }
