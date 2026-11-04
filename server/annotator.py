"""Keyword-rule argument annotator for LitLens.

Faithful Python port of normalizeText() / annotate() / hash01() / conf() from the
teammate's prototype (secit_litlens-demo.html, lines 805-903). It stands in for the
real model until the ML team swaps `analyze_text` in app.py.

JS-vs-Python regex notes (see _js_rx):
  * JS `\\s`/`\\S`/`.`/`$` differ from Python's, so patterns are written exactly as in
    the JS source and translated by `_js_rx`.
  * JS `\\b`, `\\d`, `\\w`, `\\W` are ASCII-only, and `/i` only folds ASCII letters for
    our ASCII patterns -> every pattern is compiled with re.ASCII.
  * Global-flag counting (`s.match(rx).length`) -> len(rx.findall(s)).
  * `.test()` on an anchored pattern -> rx.search(s).
Offsets (start/end) are Python str indices (code points), so text[start:end] == text of
the component. JS used UTF-16 units; the two only differ for characters outside the BMP.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

MAX_WORDS = 5000
MAX_COMPONENTS = 24
LOW = 0.6

MODEL = {
    "name": "keyword-rules",
    "version": "0.0-local",
    "component_head": "claim/premise/none",
    "relation_head": "support/attack/none",
}

# --- JS-compatible whitespace and regex translation -------------------------------

# ECMAScript WhiteSpace + LineTerminator: what JS `\s` matches and `trim()` strips.
# Python's `\s`/`str.strip()` also treat \x1c-\x1f and \x85 as whitespace and do not
# treat ﻿ as whitespace, so we spell the JS set out.
_WS_CHARS = (
    "\t\n\v\f\r   " + "".join(map(chr, range(0x2000, 0x200B))) + "    　﻿"
)
_WS_BODY = re.escape(_WS_CHARS)
_WS_LINE_TERMINATORS = r"\n\r  "


def _js_rx(source: str, flags: int = 0) -> re.Pattern[str]:
    """Compile a JS regex source (no `m`/`s`/`u` flags) with JS semantics.

    Translates, outside character classes: `\\s` and `\\S` to the JS whitespace set,
    `.` to "anything except JS line terminators", and `$` to end-of-input (`\\Z`;
    Python's `$` would also match before a trailing newline).
    """
    out: list[str] = []
    in_class = False
    i = 0
    while i < len(source):
        ch = source[i]
        if ch == "\\" and i + 1 < len(source):
            nxt = source[i + 1]
            if nxt == "s":
                out.append(_WS_BODY if in_class else f"[{_WS_BODY}]")
            elif nxt == "S" and not in_class:
                out.append(f"[^{_WS_BODY}]")
            else:
                out.append(ch + nxt)
            i += 2
            continue
        if in_class:
            if ch == "]":
                in_class = False
            out.append(ch)
        elif ch == "[":
            in_class = True
            out.append(ch)
        elif ch == ".":
            out.append(f"[^{_WS_LINE_TERMINATORS}]")
        elif ch == "$":
            out.append(r"\Z")
        else:
            out.append(ch)
        i += 1
    return re.compile("".join(out), flags | re.ASCII)


def js_trim(s: str) -> str:
    return s.strip(_WS_CHARS)


def js_trim_start(s: str) -> str:
    return s.lstrip(_WS_CHARS)


# --- keyword rules (copied from the JS source) ------------------------------------

RX_CLAIM = _js_rx(
    r"\b(should|must|ought to|need(?:s)? to|has to|have to|is (?:a )?(?:mistake|wrong|right|failure|disaster|essential|necessary|vital)|it is time|the truth is|clearly|undeniabl[ey]|we believe|i believe|i think|argue[sd]?|will (?:not|never)|cannot|can't|is the best|is the worst|deserve[sd]?|matters?\b)",
    re.I,
)
RX_EVIDENCE = _js_rx(
    r"(\bbecause\b|\bsince\b|according to|\bstud(?:y|ies)\b|\breport(?:s|ed)?\b|\bsurvey\b|\bdata\b|\bpoll\b|\bresearch\b|\bfound\b|\bshows?\b|\bsaid\b|\bper ?cent\b|%|\$\s?\d|\b\d[\d,.]*\s?(?:million|billion|thousand|people|years?|times)\b|\bfor example\b|\bfor instance\b|\brecords?\b)",
    re.I,
)
RX_CONCEDE = _js_rx(
    r"^(?:\W*)(?:critics|opponents|some (?:argue|say|claim|people)|others (?:argue|say|point)|supporters (?:say|argue)|skeptics|detractors|it is true that|admittedly|of course|although|while some)\b",
    re.I,
)
RX_CONTRAST = _js_rx(
    r"^(?:\W*)(?:but|however|yet|still|nevertheless|nonetheless|that said|on the other hand|even so|in fact|in reality)\b",
    re.I,
)
RX_CONCLUDE = _js_rx(
    r"^(?:\W*)(?:therefore|thus|so|in short|in the end|ultimately|overall|that is why|this is why)\b",
    re.I,
)

# --- text normalisation / sentence splitting patterns -----------------------------

_RX_CRLF = _js_rx(r"\r\n?")
_RX_SPACE_TAB = _js_rx(r"[ \t]+")
_RX_BLANK_LINE = _js_rx(r"\n\s*\n")
_RX_INNER_NEWLINE = _js_rx(r"\s*\n\s*")
_RX_WS_RUN = _js_rx(r"\s+")
_RX_NON_WS_RUN = _js_rx(r"\S+")
_RX_SENT_END = _js_rx(r'[.!?]+["”’)\]]*(?=\s|$)')
_RX_ABBREV = _js_rx(r"(?:^|[\s(])(?:[A-Z]\.){1,3}$|\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|Gov|Sen|Rep|Prof|Gen|Lt|No)\.$")
_RX_LEADING_QUOTES = _js_rx(r'^["“‘(]+')
_RX_TRAILING_PUNCT = _js_rx(r'[.!?]+["”’)\]]*$')
_RX_WORD4 = re.compile(r"[a-z]{4,}")


def count_words(text: str) -> int:
    """Words as the JS UI counts them: runs of non-whitespace (`/\\S+/g`)."""
    return len(_RX_NON_WS_RUN.findall(text))


def _count_rx(rx: re.Pattern[str], s: str) -> int:
    return len(rx.findall(s))


# --- hash / confidence jitter ------------------------------------------------------

def hash01(s: str) -> float:
    """FNV-1a (32-bit) over code points, mapped to [0, 1) in steps of 0.001."""
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF  # Math.imul
    return (h % 1000) / 1000


def _to_fixed2(x: float) -> float:
    # JS Number#toFixed(2): exact value of the double, ties go to the larger n.
    return float(Decimal(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def conf(base: float, s: str) -> float:
    return max(0.42, min(0.93, _to_fixed2(base + (hash01(s) - 0.5) * 0.16)))


# --- normalizeText ------------------------------------------------------------------

def normalize_text(raw: str) -> tuple[str, bool]:
    txt = js_trim(_RX_SPACE_TAB.sub(" ", _RX_CRLF.sub("\n", raw)))
    paras = [p for p in (js_trim(_RX_INNER_NEWLINE.sub(" ", p)) for p in _RX_BLANK_LINE.split(txt)) if p]
    if len(paras) == 1 and "\n" in txt:
        paras = [p for p in (js_trim(p) for p in txt.split("\n")) if p]
    words = len(_RX_WS_RUN.split(" ".join(paras)))
    truncated = False
    if words > MAX_WORDS:
        truncated = True
        left = MAX_WORDS
        keep: list[str] = []
        for p in paras:
            w = _RX_WS_RUN.split(p)
            if left <= 0:
                break
            keep.append(" ".join(w[:left]))
            left -= len(w)
        paras = keep
    return "\n\n".join(paras), truncated


# --- annotate -----------------------------------------------------------------------

@dataclass(eq=False, slots=True)  # eq=False: sentences are compared by identity (JS `s === best`)
class _Sentence:
    pi: int
    text: str
    start: int
    end: int
    c: int
    e: int
    concede: bool
    contrast: bool
    conclude: bool


def _split_sentences(text: str) -> list[_Sentence]:
    sents: list[_Sentence] = []
    off = 0
    for pi, p in enumerate(text.split("\n\n")):
        pieces: list[tuple[int, str]] = []
        frm = 0
        for bm in _RX_SENT_END.finditer(p):
            before = p[frm : bm.start() + 1]
            # abbreviation guard: "Dr." / "U.S." do not end a sentence
            if _RX_ABBREV.search(before) and bm.group(0) == ".":
                continue
            pieces.append((frm, p[frm : bm.end()]))
            frm = bm.end()
        if frm < len(p):
            pieces.append((frm, p[frm:]))
        for index, raw_s in pieces:
            lead = len(raw_s) - len(js_trim_start(raw_s))
            trimmed = js_trim(raw_s)
            s = _RX_LEADING_QUOTES.sub("", trimmed, count=1)
            start_shift = len(trimmed) - len(s)
            # Deviation from the JS: it trims whitespace left after an opening quote
            # (`" Hello`) without shifting `start`, so text[start:end] != component text.
            # Shift here so the offset invariant always holds.
            s_no_lead = js_trim_start(s)
            start_shift += len(s) - len(s_no_lead)
            s = js_trim(_RX_TRAILING_PUNCT.sub("", s_no_lead, count=1))
            if len(_RX_WS_RUN.split(s)) < 5:
                continue
            start = off + index + lead + start_shift
            sents.append(
                _Sentence(
                    pi=pi,
                    text=s,
                    start=start,
                    end=start + len(s),
                    c=_count_rx(RX_CLAIM, s),
                    e=_count_rx(RX_EVIDENCE, s),
                    concede=bool(RX_CONCEDE.search(s)),
                    contrast=bool(RX_CONTRAST.search(s)),
                    conclude=bool(RX_CONCLUDE.search(s)),
                )
            )
        off += len(p) + 2
    return sents


def annotate(raw: str, headline: str | None, source_label: str, origin: str) -> dict | None:
    """Run the keyword rules. Returns the /analyze response dict, or None if the text
    has no usable sentences. `latency_ms` is a placeholder; the caller overwrites it."""
    text, truncated = normalize_text(raw)
    sents = _split_sentences(text)
    if not sents:
        return None

    title_words = set(_RX_WORD4.findall((headline or "").lower()))

    def overlap(s: str) -> int:
        return sum(1 for w in _RX_WORD4.findall(s.lower()) if w in title_words)

    # main claim: strongest claim-like sentence, favouring the opening and the headline
    best, best_score = sents[0], -1.0
    for i, s in enumerate(sents):
        score = (
            s.c * 2
            - s.e * 0.5
            + overlap(s.text) * 1.5
            + (1.5 if s.pi == 0 else 0)
            + (1 if s.conclude else 0)
            - (3 if s.concede else 0)
            - i * 0.05
        )
        if score > best_score:
            best_score = score
            best = s

    comps: list[dict] = []
    rels: list[dict] = []
    n_claim, n_premise = 1, 0
    main_id = "C1"
    comps.append(
        {
            "id": main_id,
            "type": "claim",
            "start": best.start,
            "end": best.end,
            "text": best.text,
            "confidence": conf(0.62 + min(best.c, 3) * 0.08, best.text),
        }
    )
    rel_of: dict[str, str] = {}
    last_top: str | None = None
    para_head: str | None = None
    para_attack: str | None = None
    cur_para = -1
    for s in sents:
        if s.pi != cur_para:
            cur_para = s.pi
            para_head = None
            para_attack = None
        if s is best:
            continue
        argumentative = s.c or s.e or s.concede or s.contrast or s.conclude
        if not argumentative or len(comps) >= MAX_COMPONENTS:
            continue
        is_claim = s.c > s.e or (s.concede and not s.e) or s.conclude
        target, rel_type = main_id, "support"
        if s.concede:
            target, rel_type = main_id, "attack"
        elif s.contrast and para_attack:
            target, rel_type = para_attack, "attack"
        elif s.contrast and not para_head and last_top and rel_of.get(last_top) == "attack":
            target, rel_type = last_top, "attack"
        elif not is_claim and para_head:
            target, rel_type = para_head, "support"
        if is_claim:
            n_claim += 1
            cid = f"C{n_claim}"
        else:
            n_premise += 1
            cid = f"P{n_premise}"
        comps.append(
            {
                "id": cid,
                "type": "claim" if is_claim else "premise",
                "start": s.start,
                "end": s.end,
                "text": s.text,
                "confidence": conf(0.55 + min(s.c + s.e, 3) * 0.08, s.text),
            }
        )
        rels.append(
            {
                "id": f"R{len(rels) + 1}",
                "source": cid,
                "target": target,
                "type": rel_type,
                "confidence": conf(0.62 if target == main_id else 0.58, s.text + target),
            }
        )
        rel_of[cid] = rel_type
        if target == main_id:
            last_top = cid
        if not para_head:
            para_head = cid
        if rel_type == "attack" and target == main_id:
            para_attack = cid

    low_c = sum(1 for c in comps if c["confidence"] < LOW)
    low_r = sum(1 for r in rels if r["confidence"] < LOW)
    warnings: list[dict] = [
        {
            "code": "KEYWORD_RULES",
            "message": "No model is connected. These labels come from simple keyword rules, so expect mistakes.",
        }
    ]
    if low_c or low_r:
        warnings.append(
            {
                "code": "LOW_CONFIDENCE",
                "message": f"{low_c} component{'' if low_c == 1 else 's'} and {low_r} relation{'' if low_r == 1 else 's'} scored below 0.60.",
            }
        )
    if truncated:
        warnings.append({"code": "TRUNCATED", "message": "The text was over 5,000 words, so only the first 5,000 were analyzed."})
    if not rels:
        warnings.append({"code": "FEW_ARGUMENTS", "message": "LitLens found no premises. The text may be news reporting rather than argument."})

    comps.sort(key=lambda c: c["start"])
    return {
        "schema_version": "1.0",
        "request_id": "req_local_" + format(int(hash01(text) * 1e8), "x"),
        "status": "complete",
        "model": dict(MODEL),
        "latency_ms": 1400,
        "warnings": warnings,
        "article": {
            "url": "",
            "title": headline or "Untitled article",
            "source": source_label,
            "author": "",
            "published_at": "",
            "section": "",
            "is_mock": True,
            "word_count": len(_RX_WS_RUN.split(text)),
            "truncated": truncated,
            "text": text,
            "origin": origin,
        },
        "main_claim_id": main_id,
        "components": comps,
        "relations": rels,
        "suggested_queries": [],
    }
