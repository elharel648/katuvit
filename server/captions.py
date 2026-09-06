"""
Katuvit caption engine — pure helpers shared by every backend (Modal, Cloud Run).
No cloud SDK imports here; unit-tested in test_transcriber.py.
"""
import re

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



# ---- caption looks --------------------------------------------------------------
# ASS colours are &HAABBGGRR. Brand yellow #FFD52E -> BB=2E GG=D5 RR=FF.
WHITE, BLACK, YELLOW = "&H00FFFFFF", "&H00000000", "&H002ED5FF"

# mode: "highlight" = whole line visible, the spoken word lights up (colour = accent)
#       "boxword"   = whole line visible, the spoken word sits in an accent box with black text
#       "fill"      = true karaoke: colour sweeps through each word as it is sung
#       "neon"      = glowing outline in the accent colour, spoken word brightens
#       "reveal"    = words appear one by one as they are spoken
#       "static"    = plain line captions
# border: 1 = outline+shadow, 3 = box per word (used with transparent box for boxword), 4 = one box per line
TEMPLATES = {
    "bold":    {"mode": "highlight", "border": 4, "outline": 9, "shadow": 0, "text": WHITE, "scale": 100},
    "boxword": {"mode": "boxword",   "border": 3, "outline": 10, "shadow": 0, "text": WHITE, "scale": 100},
    "fill":    {"mode": "fill",      "border": 1, "outline": 5, "shadow": 2, "text": WHITE, "scale": 100},
    "neon":    {"mode": "neon",      "border": 1, "outline": 4, "shadow": 0, "text": WHITE, "scale": 104},
    "reveal":  {"mode": "reveal",    "border": 1, "outline": 5, "shadow": 2, "text": WHITE, "scale": 100},
    "clean":   {"mode": "highlight", "border": 1, "outline": 5, "shadow": 2, "text": WHITE, "scale": 108},
    "frame":   {"mode": "highlight", "border": 4, "outline": 10, "shadow": 0, "text": "&H00111111", "scale": 100, "box_colour": "&H10FFFFFF"},
    "classic": {"mode": "static",    "border": 1, "outline": 5, "shadow": 2, "text": WHITE, "scale": 100},
}
DEFAULT_TEMPLATE = "bold"

# accent colours the spoken word can take (ASS &HAABBGGRR)
ACCENTS = {
    "yellow": "&H002ED5FF",   # #FFD52E brand
    "green":  "&H0060F04A",   # #4AF060
    "pink":   "&H00A34FFF",   # #FF4FA3
    "cyan":   "&H00FFD84A",   # #4AD8FF
    "orange": "&H002E8AFF",   # #FF8A2E
    "white":  WHITE,
}
DEFAULT_ACCENT = "yellow"

# fontconfig family names baked into the worker image (all OFL)
FONTS = {"rubik": "Rubik", "heebo": "Heebo", "secular": "Secular One", "noto": "Noto Sans Hebrew"}
DEFAULT_FONT = "rubik"

# alignment (numpad) + vertical margin on the 1080x1920 canvas; "custom" = dragged by the user
POSITIONS = {"bottom": (2, 480), "center": (5, 0), "top": (8, 320), "custom": (5, 0)}
DEFAULT_POSITION = "bottom"
CANVAS_W, CANVAS_H = 1080, 1920  # the design canvas; other formats scale from it

# output canvases per platform (width, height at 1080p quality)
FORMATS = {
    "reel":     (1080, 1920),   # TikTok / Reels / Stories 9:16
    "square":   (1080, 1080),   # Instagram / Facebook feed 1:1
    "portrait": (1080, 1350),   # Instagram feed 4:5
    "wide":     (1920, 1080),   # YouTube / Facebook 16:9
}
DEFAULT_FORMAT = "original"          # keep the source aspect, no crop
ALL_FORMATS = {DEFAULT_FORMAT, *FORMATS}


def canvas_for(fmt: str, quality: str = "1080p") -> tuple[int, int | None]:
    """Output (width, height) for a platform format; height None = keep the source aspect."""
    if fmt not in FORMATS:
        return (720 if quality == "720p" else 1080), None
    w, h = FORMATS[fmt]
    if quality == "720p":
        w, h = (w * 2) // 3, (h * 2) // 3
    return w - w % 2, h - h % 2


def clamp_frac(value, default: float) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.05, min(0.95, v))

# vocalisations only (never real words like "כאילו" — the editor offers those as a one-tap cleanup)
FILLER_WORDS = {"אה", "אהה", "אההה", "אמ", "אממ", "אמממ", "המ", "הממ", "אמם", "uh", "um", "umm", "hmm", "mm", "erm", "ah", "eh"}


def strip_fillers(segments: list) -> list:
    """Drop filler vocalisations from transcript segments (words + rebuilt text)."""
    import re as _re
    out = []
    for seg in segments:
        words = [w for w in seg.get("words", []) if _re.sub(r"[^\w]", "", str(w.get("w", "")).strip().lower()) not in FILLER_WORDS]
        if not words:
            continue
        out.append({**seg, "words": words, "text": " ".join(w["w"].strip() for w in words)})
    return out


# what the spoken word does when it becomes active
ANIMATIONS = {"none", "pop"}
DEFAULT_ANIMATION = "none"


def style_options(body: dict) -> dict:
    """Whitelisted style choices from the client; anything unknown falls back to defaults."""
    body = body or {}
    return {
        "template": body.get("template") if body.get("template") in TEMPLATES else DEFAULT_TEMPLATE,
        "accent": body.get("accent") if body.get("accent") in ACCENTS else DEFAULT_ACCENT,
        "font": body.get("font") if body.get("font") in FONTS else DEFAULT_FONT,
        "position": body.get("position") if body.get("position") in POSITIONS else DEFAULT_POSITION,
        "animation": body.get("animation") if body.get("animation") in ANIMATIONS else DEFAULT_ANIMATION,
        # centre of the caption as fractions of the frame (only used when position == "custom")
        "pos_x": clamp_frac(body.get("pos_x"), 0.5),
        "pos_y": clamp_frac(body.get("pos_y"), 0.75),
        "format": body.get("format") if body.get("format") in ALL_FORMATS else DEFAULT_FORMAT,
    }
MAX_WORDS_PER_LINE = 24

# ---- plans & quotas (the real protection against runaway cost) ----------------
FREE_LIFETIME_VIDEOS = 3        # with watermark
PRO_MONTHLY_VIDEOS = 60         # subscription cap
WATERMARK_TEXT = "כתוביות"


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
    return [{"w": w, "s": start + i * step, "e": start + (i + 1) * step, "em": False} for i, w in enumerate(parts)]


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
        words.append({"w": w, "s": min(max(ws, start), end), "e": min(max(we, start), end), "em": bool(item.get("em"))})
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


def _active_tags(tpl: dict, accent: str, animation: str) -> str:
    """Override block that marks the word being spoken, per look."""
    mode = tpl["mode"]
    if mode == "boxword":
        tags = "\\3c" + accent + "&\\1c&H00000000&"        # BorderStyle 3 boxes are drawn in OutlineColour; black text on the accent box
    elif mode == "neon":
        tags = "\\1c&H00FFFFFF&\\bord7\\blur6"           # brighter core, wider glow
    else:
        tags = "\\c" + accent + "&"
    if tpl["scale"] != 100:
        tags += f"\\fscx{tpl['scale']}\\fscy{tpl['scale']}"
    if animation == "pop":
        # quick scale bounce as the word lights up
        tags += "\\fscx100\\fscy100\\t(0,110,\\fscx114\\fscy114)\\t(110,260,\\fscx100\\fscy100)"
    return "{" + tags + "}"


def _events_for_line(line: dict, tpl: dict, accent: str = ACCENTS[DEFAULT_ACCENT], animation: str = DEFAULT_ANIMATION) -> list:
    """(start, end, text-with-overrides) events for one caption line."""
    words = line["words"]
    if tpl["mode"] == "static" or len(words) <= 1:
        em_open = "{\\c" + accent + "&}"
        text = " ".join((em_open + x["w"] + "{\\r}") if x.get("em") else x["w"] for x in words) if words else line["text"]
        return [(line["start"], line["end"], text)]

    if tpl["mode"] == "fill":
        # one event per line; \kf sweeps the fill colour through each word for its duration (centiseconds)
        parts = []
        for i, w in enumerate(words):
            nxt = words[i + 1]["s"] if i + 1 < len(words) else line["end"]
            dur = max(1, int(round((nxt - max(w["s"], line["start"])) * 100)))
            parts.append(f"{{\\kf{dur}}}{w['w']}")
        return [(line["start"], line["end"], " ".join(parts))]

    active_open = _active_tags(tpl, accent, animation)
    reset = "{\\r}"
    em_open = "{\\c" + accent + "&}"

    def render(x: dict, is_active: bool) -> str:
        if is_active:
            return active_open + x["w"] + reset
        if x.get("em"):
            return em_open + x["w"] + reset
        return x["w"]

    events = []
    for i, w in enumerate(words):
        seg_start = max(line["start"], w["s"]) if i else line["start"]
        seg_end = words[i + 1]["s"] if i + 1 < len(words) else line["end"]
        if seg_end <= seg_start:
            continue
        if tpl["mode"] == "reveal":
            text = " ".join(render(x, False) for x in words[: i + 1])
        else:
            text = " ".join(render(x, j == i) for j, x in enumerate(words))
        events.append((seg_start, seg_end, text))
    return events


def build_ass(
    lines: list,
    template: str,
    font_size: int = 108,
    watermark: bool = False,
    accent: str = DEFAULT_ACCENT,
    font: str = DEFAULT_FONT,
    position: str = DEFAULT_POSITION,
    animation: str = DEFAULT_ANIMATION,
    pos_x: float = 0.5,
    pos_y: float = 0.75,
    fmt: str = DEFAULT_FORMAT,
) -> str:
    tpl = TEMPLATES.get(template, TEMPLATES[DEFAULT_TEMPLATE])
    play_w, play_h = FORMATS.get(fmt, (CANVAS_W, CANVAS_H))
    # Sizes were designed on the 1080×1920 canvas. Text scales with the frame AREA (geometric mean of
    # the two ratios) so a caption covers the same share of a square or wide frame as of a reel —
    # pure height scaling made 16:9 captions tiny. Margins stay axis-relative so presets land where
    # they should (bottom = 25 % up the frame, top = 1/6 down).
    k = ((play_w * play_h) / (CANVAS_W * CANVAS_H)) ** 0.5
    kh = play_h / CANVAS_H
    kw = play_w / CANVAS_W
    font_px = max(24, int(round(font_size * k)))
    outline_px = max(1, int(round(tpl["outline"] * k))) if tpl["outline"] else 0
    shadow_px = int(round(tpl["shadow"] * k))
    margin_lr = int(round(70 * kw))
    accent_c = ACCENTS.get(accent, ACCENTS[DEFAULT_ACCENT])
    font_name = FONTS.get(font, FONTS[DEFAULT_FONT])
    align, margin_v = POSITIONS.get(position, POSITIONS[DEFAULT_POSITION])
    margin_v = int(round(margin_v * kh))
    border_style = tpl["border"]
    mode = tpl["mode"]
    # colours per look: primary/secondary drive \kf fills; outline colour is the box for BorderStyle 3
    primary, secondary = tpl["text"], tpl["text"]
    outline_c = BLACK
    back = "&H9A000000" if border_style == 4 else "&H80000000"
    if mode == "fill":
        primary, secondary = accent_c, tpl["text"]          # sweeps from text colour to accent
    # boxword keeps the opaque black OutlineColour: libass only draws BorderStyle-3 boxes when it is opaque,
    # so every word gets a black box and the spoken word's box switches to the accent (the "word box" look)
    if mode == "neon":
        outline_c = accent_c
    if tpl.get("box_colour"):
        back = tpl["box_colour"]
    mark_px = max(18, int(round(42 * k)))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_w}
PlayResY: {play_h}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{font_name},{font_px},{primary},{secondary},{outline_c},{back},-1,0,0,0,100,100,0,0,{border_style},{outline_px},{shadow_px},{align},{margin_lr},{margin_lr},{margin_v},177
Style: Mark,Noto Sans Hebrew,{mark_px},&H60FFFFFF,&H60FFFFFF,&H60000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,9,0,{int(round(44 * kw))},{int(round(120 * kh))},177

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    if watermark:
        # free tier: small translucent brand mark, top-right, for the whole video
        events.append(f"Dialogue: 1,0:00:00.00,9:59:59.00,Mark,,0,0,0,,{WATERMARK_TEXT}\n")
    glow = "{\\blur4}" if mode == "neon" else ""
    if position == "custom":
        # dragged position: centre anchor (alignment 5) at exact canvas coordinates
        px, py = int(round(pos_x * play_w)), int(round(pos_y * play_h))
        glow = "{\\pos(%d,%d)}" % (px, py) + glow
    for line in lines:
        for start, end, text in _events_for_line(line, tpl, accent_c, animation):
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Cap,,0,0,0,,{glow}{text}\n")
    return header + "".join(events)


def quota_decision(user: dict, now_ts: float) -> tuple[bool, str]:
    """
    Which allowance pays for the next video, in priority order:
      pro (active subscription under its monthly cap) → credit (bought packs) → free (3 lifetime).
    Returns (allowed, kind) where kind ∈ {'pro','credit','free','quota_exceeded'}.
    user fields: plan, pro_until (unix ts), monthly_used, credits, free_used.
    """
    user = user or {}
    if user.get("plan") == "pro" and float(user.get("pro_until") or 0) > now_ts:
        if int(user.get("monthly_used") or 0) < PRO_MONTHLY_VIDEOS:
            return True, "pro"
    if int(user.get("credits") or 0) > 0:
        return True, "credit"
    if int(user.get("free_used") or 0) < FREE_LIFETIME_VIDEOS:
        return True, "free"
    return False, "quota_exceeded"


def consume(user: dict, kind: str) -> dict:
    """Field updates after a successful transcription paid by `kind`."""
    user = dict(user or {})
    if kind == "pro":
        user["monthly_used"] = int(user.get("monthly_used") or 0) + 1
    elif kind == "credit":
        user["credits"] = max(0, int(user.get("credits") or 0) - 1)
    elif kind == "free":
        user["free_used"] = int(user.get("free_used") or 0) + 1
    user["videos_total"] = int(user.get("videos_total") or 0) + 1
    return user


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



HDR_TRANSFERS = {"arib-std-b67", "smpte2084"}  # HLG, PQ — iPhone HDR video


def is_hdr(color_transfer, pix_fmt) -> bool:
    """10-bit or HDR-transfer sources must be tone-mapped to 8-bit SDR: iOS cannot
    decode H.264 High 10, so a naive burn plays BLACK with sound (found 2026-09-06)."""
    return (color_transfer or "") in HDR_TRANSFERS or "10" in (pix_fmt or "")


def video_filter(width: int, ass_path: str, hdr: bool, height: int | None = None) -> str:
    """
    Scale → (HDR: tone-map to bt709) → 8-bit → burn subtitles last so they stay full-bright.
    With `height`, the source is scaled to COVER width×height and centre-cropped to it (platform formats).
    """
    if height:
        chain = [
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}",
        ]
    else:
        chain = [f"scale={width}:-2"]
    if hdr:
        chain += [
            "zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709",
            "tonemap=tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv",
        ]
    chain += ["format=yuv420p", f"subtitles={ass_path}"]
    return ",".join(chain)



def probe_video(path: str) -> dict:
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


