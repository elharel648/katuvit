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


