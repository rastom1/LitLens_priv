"""Unit tests for the JS -> Python port of the keyword-rule annotator.

Expected values are derived by hand from the JS source (or are published FNV-1a
vectors), not snapshotted from this implementation.
"""
import annotator
from annotator import annotate, conf, count_words, hash01, normalize_text


def pairs(result):
    comps = {c["id"]: c for c in result["components"]}
    return [(r["source"], r["target"], r["type"]) for r in result["relations"]], comps


def assert_offsets(result):
    text = result["article"]["text"]
    for c in result["components"]:
        assert text[c["start"] : c["end"]] == c["text"]


# --- hash / conf ---------------------------------------------------------------------

def test_hash01_matches_fnv1a_32_vectors():
    # FNV-1a 32-bit: "" -> 0x811c9dc5 (2166136261), "a" -> 0xe40c292c, "foobar" -> 0xbf9cf968
    assert hash01("") == 0.261
    assert hash01("a") == 0.22
    assert hash01("foobar") == 0.72


def test_hash01_iterates_code_points_not_utf16_units():
    # one astral code point: h = (2166136261 ^ 0x1F600) * 16777619 mod 2**32
    expected = (((2166136261 ^ 0x1F600) * 16777619) & 0xFFFFFFFF) % 1000 / 1000
    assert hash01("\U0001F600") == expected


def test_conf_rounds_to_two_places_and_clamps():
    for s in ("a", "foobar", "", "the council should approve"):
        for base in (0.55, 0.62, 0.8, 1.2, -1.0):
            v = conf(base, s)
            assert 0.42 <= v <= 0.93
            assert round(v, 2) == v
    assert conf(5.0, "a") == 0.93
    assert conf(0.0, "a") == 0.42
    # hash01("") = 0.261 -> 0.62 + (0.261 - 0.5) * 0.16 = 0.58176 -> 0.58
    assert conf(0.62, "") == 0.58


# --- JS regex semantics ----------------------------------------------------------------

def test_js_whitespace_set():
    assert count_words("a b") == 2  # NBSP is JS whitespace
    assert count_words("a　b") == 2
    assert count_words("a﻿b") == 2  # BOM is JS whitespace, not Python's
    assert count_words("a\x1cb") == 1  # Python \s would split here, JS does not
    assert count_words("a\x85b") == 1
    assert count_words("") == 0 and count_words("  \n\t ") == 0


def test_js_regex_translation():
    assert annotator._js_rx(r"a$").search("a\n") is None  # JS `$` is end-of-input only
    assert annotator._js_rx(r"a$").search("a") is not None
    assert annotator._js_rx(r"a.b").search("a\rb") is None  # JS `.` excludes \r,  ,
    assert annotator._js_rx(r"a.b").search("a b") is None
    assert annotator._js_rx(r"a.b").search("a\x85b") is not None
    assert annotator._js_rx(r"[\s(]x").search("﻿x") is not None  # \s inside a class
    assert annotator._js_rx(r"\bcat\b").search("écat") is not None  # ASCII-only \b


def test_keyword_regexes():
    assert annotator.RX_CLAIM.findall("We SHOULD act. It cannot wait; it matters.") == ["SHOULD", "cannot", "matters"]
    assert len(annotator.RX_EVIDENCE.findall("According to the data, 40% of 2 million people said so.")) == 5
    assert annotator.RX_CONCEDE.search("  \"Critics argue otherwise.") is not None
    assert annotator.RX_CONCEDE.search("The critics argue otherwise.") is None
    assert annotator.RX_CONTRAST.search("However, it failed.") is not None
    assert annotator.RX_CONTRAST.search("Howeverish.") is None
    assert annotator.RX_CONCLUDE.search("So it goes.") is not None
    assert annotator.RX_CONCLUDE.search("Sorry about that.") is None


# --- normalizeText -----------------------------------------------------------------------

def test_normalize_paragraphs_and_whitespace():
    assert normalize_text("  a  b\r\nc d\r\n\r\n\r\ne\tf  ") == ("a b c d\n\ne f", False)
    assert normalize_text("one two\nthree four\nfive six") == ("one two\n\nthree four\n\nfive six", False)  # single \n = paragraphs
    assert normalize_text("") == ("", False)


def test_normalize_truncation_boundary():
    assert normalize_text(" ".join(["w"] * 5000)) == (" ".join(["w"] * 5000), False)
    text, truncated = normalize_text(" ".join(["w"] * 5001))
    assert truncated and len(text.split()) == 5000
    paras = "\n\n".join(" ".join(["w"] * 2000) for _ in range(3))  # 6000 words
    text, truncated = normalize_text(paras)
    assert truncated
    assert [len(p.split()) for p in text.split("\n\n")] == [2000, 2000, 1000]


# --- sentence splitting ------------------------------------------------------------------

def sentence_texts(text):
    return [s.text for s in annotator._split_sentences(text)]


def test_abbreviation_guard():
    text = "Dr. Smith and Mr. Jones said the U.S. plan should pass today. The mayor disagreed with the plan."
    assert sentence_texts(text) == [
        "Dr. Smith and Mr. Jones said the U.S. plan should pass today",
        "The mayor disagreed with the plan",
    ]
    # guard only applies when the terminator is a lone "." (here it is "...")
    assert sentence_texts("Ask Dr... Smith about the new plan for the town.") == ["Smith about the new plan for the town"]


def test_short_fragments_are_dropped_and_terminal_punctuation_stripped():
    assert sentence_texts('Too short. "This one has enough words in it!" Why not four?') == ["This one has enough words in it"]


def test_offsets_hold_for_quotes_leading_space_astral_and_nbsp():
    cases = [
        '" The council should approve the transit plan because the data shows savings." Critics argue that costs will rise sharply this year.',
        "“ The council should approve the plan.” Some say the plan costs too much money.",
        "The council \U0001F600 should approve the plan because the data shows savings. Critics argue that costs will rise.",
        "First paragraph has plenty of words in it today.\n\nThe second paragraph should also count because data shows it.",
    ]
    for raw in cases:
        result = annotate(raw, None, "Pasted text", "pasted")
        assert result is not None
        assert_offsets(result)


# --- annotate: targets, caps, warnings --------------------------------------------------

def test_main_claim_prefers_claim_words_in_first_paragraph():
    raw = "Intro sentence about the weather today in town. The council must approve the transit levy now."
    result = annotate(raw, None, "Pasted text", "pasted")
    main = next(c for c in result["components"] if c["id"] == result["main_claim_id"])
    assert main["text"] == "The council must approve the transit levy now"
    assert main["type"] == "claim"


def test_support_chain_targets():
    raw = (
        "The city should build the new line. "
        "Ridership data shows strong demand on the corridor. "
        "Another study found the same pattern in the east."
    )
    rels, comps = pairs(annotate(raw, None, "Pasted text", "pasted"))
    # S1 (premise) -> main; S2 (premise) -> paragraph head = S1's id
    assert rels == [("P1", "C1", "support"), ("P2", "P1", "support")]
    assert comps["C1"]["text"] == "The city should build the new line"


def test_concede_attacks_main_and_contrast_attacks_paragraph_attack():
    raw = (
        "The city should build the new line because ridership data shows demand. "
        "Critics argue that the levy is too high. "
        "But the data shows the levy is lower than car costs."
    )
    result = annotate(raw, None, "Pasted text", "pasted")
    rels, comps = pairs(result)
    assert rels == [("C2", "C1", "attack"), ("P1", "C2", "attack")]
    assert comps["C2"]["type"] == "claim" and comps["P1"]["type"] == "premise"
    assert [w["code"] for w in result["warnings"]][0] == "KEYWORD_RULES"


def test_component_cap_is_24():
    raw = " ".join(["The council should approve the plan today because data shows it."] * 60)
    result = annotate(raw, None, "Pasted text", "pasted")
    assert len(result["components"]) == 24
    assert len(result["relations"]) == 23
    assert_offsets(result)


def test_few_arguments_warning_and_no_relations():
    raw = (
        "The river runs past the old mill every morning. Children walk along the bank after school ends. "
        "Cyclists pass the bridge near the market. A bakery opens early on the corner street. "
        "Fishermen sit under the willow trees quietly. Evening light settles over the quiet water."
    )
    result = annotate(raw, None, "Pasted text", "pasted")
    assert result["relations"] == []
    assert len(result["components"]) == 1
    codes = [w["code"] for w in result["warnings"]]
    assert "FEW_ARGUMENTS" in codes and "TRUNCATED" not in codes


def test_low_confidence_warning_counts_match_data():
    raw = "The city should build the new line. " + "Ridership data shows strong demand on the corridor. " * 3
    result = annotate(raw, None, "Pasted text", "pasted")
    low_c = sum(c["confidence"] < 0.6 for c in result["components"])
    low_r = sum(r["confidence"] < 0.6 for r in result["relations"])
    warning = next((w for w in result["warnings"] if w["code"] == "LOW_CONFIDENCE"), None)
    if low_c or low_r:
        c_word = "component" if low_c == 1 else "components"
        r_word = "relation" if low_r == 1 else "relations"
        assert warning["message"] == f"{low_c} {c_word} and {low_r} {r_word} scored below 0.60."
    else:
        assert warning is None


def test_deterministic_and_no_sentences_returns_none():
    raw = "The city should build the new line because ridership data shows demand."
    a, b = annotate(raw, "Line", "Pasted text", "pasted"), annotate(raw, "Line", "Pasted text", "pasted")
    assert a == b
    assert a["request_id"] == "req_local_" + format(int(hash01(a["article"]["text"]) * 1e8), "x")
    assert annotate("Hi. Ok. No. Yes.", None, "Pasted text", "pasted") is None
    assert annotate("", None, "Pasted text", "pasted") is None
