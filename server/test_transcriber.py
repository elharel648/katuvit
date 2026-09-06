"""
Unit tests for the pure helpers in transcriber.py (no GPU / no Modal calls).
Run:  ~/.local/share/uv/tools/modal/bin/python server/test_transcriber.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from transcriber import (  # noqa: E402
    FONT_MAX,
    FONT_MIN,
    MAX_LINES,
    MAX_TEXT_CHARS,
    MEDIA_ID_RE,
    ass_time,
    build_ass,
    check_key,
    clamp_font,
    clean_caption_text,
    normalize_lines,
)


def test_ass_time_formats_centiseconds():
    assert ass_time(0) == "0:00:00.00"
    assert ass_time(1.5) == "0:00:01.50"
    assert ass_time(59.999) == "0:01:00.00"      # never "0:00:60.00"
    assert ass_time(3661.25) == "1:01:01.25"
    assert ass_time(-3) == "0:00:00.00"          # negative clamps to zero


def test_clean_caption_text_strips_ass_markup():
    assert clean_caption_text("שלום {\\b1}עולם{\\b0}") == "שלום ＼b1עולם＼b0"
    assert "{" not in clean_caption_text("{\\pos(0,0)}hack")
    assert clean_caption_text("a\\Nb") == "a＼Nb"       # \N newline escape neutralized
    assert clean_caption_text("שורה\nשנייה\tטאב") == "שורה שנייה טאב"
    assert clean_caption_text("  רווחים   כפולים  ") == "רווחים כפולים"
    assert len(clean_caption_text("x" * 1000)) == MAX_TEXT_CHARS
    assert clean_caption_text(None) == "None"           # never raises


def test_clamp_font():
    assert clamp_font(88) == 88
    assert clamp_font(5) == FONT_MIN
    assert clamp_font(9999) == FONT_MAX
    assert clamp_font("abc") == 88
    assert clamp_font(None) == 88
    assert clamp_font("100") == 100


def test_normalize_lines_filters_and_caps():
    raw = [
        {"start": 0, "end": 1.2, "text": "טוב חברים"},
        {"start": 2, "end": 1, "text": "end before start"},   # dropped
        {"start": 3, "end": 4, "text": "   "},                # empty -> dropped
        "garbage",                                            # dropped
        {"start": "x", "end": 5, "text": "bad number"},       # dropped
        {"start": 5, "end": 6, "text": "{\\an5}hack"},        # sanitized
    ]
    out = normalize_lines(raw)
    assert [l["text"] for l in out] == ["טוב חברים", "＼an5hack"]
    many = [{"start": i, "end": i + 1, "text": "a"} for i in range(MAX_LINES + 50)]
    assert len(normalize_lines(many)) == MAX_LINES


def test_normalize_lines_rejects_non_list():
    try:
        normalize_lines({"start": 0})
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


def test_build_ass_structure():
    ass = build_ass([{"start": 0, "end": 1, "text": "שלום"}], "yellow", 90)
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    assert "Style: Cap,Noto Sans Hebrew,90,&H003DE2FF" in ass
    assert "Dialogue: 0,0:00:00.00,0:00:01.00,Cap,,0,0,0,,שלום" in ass
    # unknown template falls back to classic, never KeyError
    assert "&H00FFFFFF" in build_ass([], "does-not-exist")


def test_media_id_regex():
    assert MEDIA_ID_RE.match("a" * 32)
    assert MEDIA_ID_RE.match("0123456789abcdef0123456789abcdef")
    assert not MEDIA_ID_RE.match("../../etc/passwd")
    assert not MEDIA_ID_RE.match("0123456789ABCDEF0123456789ABCDEF")  # uppercase
    assert not MEDIA_ID_RE.match("a" * 31)
    assert not MEDIA_ID_RE.match("a" * 32 + "\n")


def test_check_key():
    assert check_key("secret", "secret")
    assert not check_key("secret", "Secret")
    assert not check_key(None, "secret")
    assert not check_key("secret", "")
    assert not check_key("secret", None)
    assert not check_key(123, "123")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} tests passed")
