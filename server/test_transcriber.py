"""
Unit tests for the pure helpers in transcriber.py (no GPU / no Modal calls).
Run:  python3 server/test_transcriber.py  (engine lives in captions.py; no cloud SDK needed)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from captions import (  # noqa: E402
    FONT_MAX,
    FONT_MIN,
    MAX_LINES,
    MAX_TEXT_CHARS,
    MEDIA_ID_RE,
    TEMPLATES,
    YELLOW,
    _events_for_line,
    ass_time,
    build_ass,
    check_key,
    clamp_font,
    clean_caption_text,
    even_words,
    consume,
    quota_decision,
    FREE_LIFETIME_VIDEOS,
    PRO_MONTHLY_VIDEOS,
    WATERMARK_TEXT,
    is_hdr,
    video_filter,
    normalize_lines,
    normalize_words,
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
    assert clamp_font("abc") == 108
    assert clamp_font(None) == 108
    assert clamp_font("100") == 100


def test_even_words_spreads_evenly():
    w = even_words("א ב ג ד", 10.0, 12.0)
    assert [x["w"] for x in w] == ["א", "ב", "ג", "ד"]
    assert w[0]["s"] == 10.0 and abs(w[-1]["e"] - 12.0) < 1e-9
    assert abs((w[1]["s"] - w[0]["s"]) - 0.5) < 1e-9
    assert even_words("   ", 0, 1) == []


def test_normalize_words_uses_client_timings_when_they_match_text():
    raw = [{"w": " שלום,", "s": 0.3, "e": 1.2}, {"w": " שמי", "s": 1.2, "e": 2.3}]
    out = normalize_words(raw, "שלום, שמי", 0.3, 2.3)
    assert [x["w"] for x in out] == ["שלום,", "שמי"]
    assert out[0]["s"] == 0.3 and out[1]["s"] == 1.2


def test_normalize_words_falls_back_when_edited_or_malformed():
    raw = [{"w": "שלום", "s": 0, "e": 1}, {"w": "שמי", "s": 1, "e": 2}]
    # user rewrote the line -> words no longer match -> even spacing over the new text
    out = normalize_words(raw, "היי לכולם חברים", 0.0, 3.0)
    assert [x["w"] for x in out] == ["היי", "לכולם", "חברים"]
    assert abs(out[1]["s"] - 1.0) < 1e-9
    # garbage -> fallback, never raises
    assert [x["w"] for x in normalize_words("nope", "א ב", 0, 2)] == ["א", "ב"]
    assert [x["w"] for x in normalize_words([{"w": "א", "s": "x"}], "א", 0, 2)] == ["א"]
    # timings clamped into the line
    out = normalize_words([{"w": "א", "s": -5, "e": 99}], "א", 1.0, 2.0)
    assert out[0]["s"] == 1.0 and out[0]["e"] == 2.0
    # markup inside a word is neutralized (compared against the cleaned text)
    out = normalize_words([{"w": "{\\an5}א", "s": 0, "e": 1}], "＼an5א", 0, 1)
    assert out[0]["w"] == "＼an5א"


def test_normalize_lines_filters_caps_and_attaches_words():
    raw = [
        {"start": 0, "end": 1.2, "text": "טוב חברים", "words": [
            {"w": "טוב", "s": 0, "e": 0.5}, {"w": "חברים", "s": 0.5, "e": 1.2}]},
        {"start": 2, "end": 1, "text": "end before start"},   # dropped
        {"start": 3, "end": 4, "text": "   "},                # empty -> dropped
        "garbage",                                            # dropped
        {"start": "x", "end": 5, "text": "bad number"},       # dropped
        {"start": 5, "end": 6, "text": "{\\an5}hack"},        # sanitized, words even-split
    ]
    out = normalize_lines(raw)
    assert [l["text"] for l in out] == ["טוב חברים", "＼an5hack"]
    assert [w["w"] for w in out[0]["words"]] == ["טוב", "חברים"]
    assert len(out[1]["words"]) == 1
    many = [{"start": i, "end": i + 1, "text": "a"} for i in range(MAX_LINES + 50)]
    assert len(normalize_lines(many)) == MAX_LINES


def test_normalize_lines_rejects_non_list():
    try:
        normalize_lines({"start": 0})
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


LINE = {
    "start": 10.0, "end": 12.0, "text": "טוב חברים יש",
    "words": [{"w": "טוב", "s": 10.0, "e": 10.5}, {"w": "חברים", "s": 10.6, "e": 11.3}, {"w": "יש", "s": 11.4, "e": 12.0}],
}


def test_highlight_events_light_up_one_word_at_a_time():
    ev = _events_for_line(LINE, TEMPLATES["bold"])
    assert len(ev) == 3
    # one contiguous event per word: word i is active until the next word starts
    assert (ev[0][0], ev[0][1]) == (10.0, 10.6)
    assert (ev[1][0], ev[1][1]) == (10.6, 11.4)
    assert (ev[2][0], ev[2][1]) == (11.4, 12.0)
    assert ev[0][2] == "{\\c" + YELLOW + "&}טוב{\\r} חברים יש"
    assert ev[1][2] == "טוב {\\c" + YELLOW + "&}חברים{\\r} יש"
    # 'clean' also scales the active word
    ev_clean = _events_for_line(LINE, TEMPLATES["clean"])
    assert "\\fscx108\\fscy108" in ev_clean[0][2]


def test_reveal_events_accumulate_words():
    ev = _events_for_line(LINE, TEMPLATES["reveal"])
    assert [e[2] for e in ev] == ["טוב", "טוב חברים", "טוב חברים יש"]
    assert ev[-1][1] == 12.0


def test_static_and_single_word_lines_are_one_event():
    assert _events_for_line(LINE, TEMPLATES["classic"]) == [(10.0, 12.0, "טוב חברים יש")]
    one = {"start": 0, "end": 1, "text": "היי", "words": [{"w": "היי", "s": 0, "e": 1}]}
    assert _events_for_line(one, TEMPLATES["bold"]) == [(0, 1, "היי")]


def test_build_ass_structure():
    ass = build_ass(normalize_lines([LINE]), "bold", 90)
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    assert "Style: Cap,Noto Sans Hebrew,90," in ass
    assert ",4,9,0,2,70,70,480,177" in ass            # box style (+padding), bottom-center, safe-zone margin
    assert ass.count("Dialogue:") == 3
    assert "Dialogue: 0,0:00:10.00,0:00:10.60,Cap,,0,0,0,,{\\c" + YELLOW + "&}טוב{\\r} חברים יש" in ass
    # unknown template falls back to the default look, never KeyError
    assert "Dialogue:" in build_ass(normalize_lines([LINE]), "does-not-exist")
    # user text can never open an override block of its own
    hostile = normalize_lines([{"start": 0, "end": 1, "text": "{\\pos(0,0)}x y"}])
    assert "{\\pos" not in build_ass(hostile, "bold")


def test_hdr_detection_and_filter_chain():
    assert is_hdr("arib-std-b67", "yuv420p10le")      # iPhone HLG
    assert is_hdr("smpte2084", "yuv420p10le")         # PQ
    assert is_hdr(None, "yuv420p10le")                # 10-bit without tags
    assert not is_hdr("bt709", "yuv420p")
    assert not is_hdr(None, None)
    sdr = video_filter(1080, "/tmp/c.ass", hdr=False)
    assert sdr == "scale=1080:-2,format=yuv420p,subtitles=/tmp/c.ass"
    hdr = video_filter(720, "/tmp/c.ass", hdr=True)
    assert hdr.startswith("scale=720:-2,zscale=t=linear") and "tonemap=" in hdr
    assert hdr.endswith("format=yuv420p,subtitles=/tmp/c.ass")   # subtitles burned after SDR conversion


def test_quota_priority_pro_then_credits_then_free():
    now = 1_000_000.0
    assert quota_decision({}, now) == (True, "free")                       # brand-new user
    assert quota_decision({"free_used": FREE_LIFETIME_VIDEOS}, now) == (False, "quota_exceeded")
    assert quota_decision({"free_used": 3, "credits": 2}, now) == (True, "credit")
    pro = {"plan": "pro", "pro_until": now + 10, "credits": 5, "free_used": 3}
    assert quota_decision(pro, now) == (True, "pro")                        # pro before credits
    capped = dict(pro, monthly_used=PRO_MONTHLY_VIDEOS)
    assert quota_decision(capped, now) == (True, "credit")                  # cap hit → packs
    expired = dict(pro, pro_until=now - 1, credits=0)
    assert quota_decision(expired, now) == (False, "quota_exceeded")        # expired pro, nothing left
    assert quota_decision(None, now) == (True, "free")                      # never raises


def test_consume_updates_the_right_counter():
    assert consume({}, "free")["free_used"] == 1
    assert consume({"credits": 2}, "credit")["credits"] == 1
    assert consume({"credits": 0}, "credit")["credits"] == 0               # never negative
    assert consume({"monthly_used": 4}, "pro")["monthly_used"] == 5
    assert consume({"videos_total": 9}, "free")["videos_total"] == 10


def test_watermark_only_for_free_tier():
    lines = normalize_lines([LINE])
    assert WATERMARK_TEXT not in build_ass(lines, "bold", 100)
    marked = build_ass(lines, "bold", 100, watermark=True)
    assert "Style: Mark," in marked
    assert f"9:59:59.00,Mark,,0,0,0,,{WATERMARK_TEXT}" in marked
    assert marked.count("Dialogue:") == 4                                   # 3 karaoke events + 1 mark


def test_media_id_regex():
    assert MEDIA_ID_RE.match("a" * 32)
    assert MEDIA_ID_RE.match("0123456789abcdef0123456789abcdef")
    assert not MEDIA_ID_RE.match("../../etc/passwd")
    assert not MEDIA_ID_RE.match("0123456789ABCDEF0123456789ABCDEF")  # uppercase
    assert not MEDIA_ID_RE.match("a" * 31)
    assert not MEDIA_ID_RE.match("a" * 32 + "\n")


def test_check_key():
    assert check_key("secret", "secret")
    assert check_key(" secret\n", "secret")           # tolerant of whitespace
    assert check_key(b"secret", "secret")             # bytes accepted
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
