import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
FIXTURES = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(FIXTURE_DIR.glob("*.json"))]
LINE3 = FIXTURES[1]
NO_CONTENT = {"error": {"code": "NO_ARTICLE_CONTENT", "message": "LitLens needs at least 30 words of article text."}}

client = TestClient(app)


def check_analysis(data: dict) -> None:
    """Structural invariants every /analyze result must satisfy (fixtures and annotated)."""
    assert data["schema_version"] == "1.0"
    assert data["status"] == "complete"
    assert {"name", "version", "component_head", "relation_head"} <= data["model"].keys()
    assert isinstance(data["latency_ms"], int)
    assert isinstance(data["suggested_queries"], list)

    text = data["article"]["text"]
    comps, rels = data["components"], data["relations"]
    ids = [c["id"] for c in comps]
    assert len(set(ids)) == len(ids)
    assert data["main_claim_id"] in ids
    assert [c["start"] for c in comps] == sorted(c["start"] for c in comps)

    for c in comps:
        assert c["type"] in ("claim", "premise")
        assert 0 <= c["confidence"] <= 1
        assert text[c["start"] : c["end"]] == c["text"]

    outgoing: dict[str, str] = {}
    for r in rels:
        assert r["type"] in ("support", "attack")
        assert 0 <= r["confidence"] <= 1
        assert r["source"] in ids and r["target"] in ids
        assert r["source"] not in outgoing, f"{r['source']} is the source of more than one relation"
        outgoing[r["source"]] = r["target"]

    for cid in ids:
        seen, cur = {cid}, cid
        while cur in outgoing:
            cur = outgoing[cur]
            assert cur not in seen, f"cycle through {cur}"
            seen.add(cur)
        assert cur == data["main_claim_id"] or cur not in outgoing


def url_variants(url: str) -> list[str]:
    return [
        url,
        url.replace("://", "://www.", 1),
        url + "/",
        url + "///",
        url + "?utm_source=newsletter&utm_medium=email",
        url + "#comments",
        url + "/?utm_campaign=x#top",
        url.replace("https://", "http://", 1),
        url.upper(),
        f"  {url}  ",
    ]


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model"] == {
        "name": "keyword-rules",
        "version": "0.0-local",
        "component_head": "claim/premise/none",
        "relation_head": "support/attack/none",
    }


def test_samples():
    r = client.get("/samples")
    assert r.status_code == 200
    samples = r.json()
    assert len(samples) == 4
    assert samples == [
        {
            "url": f["article"]["url"],
            "title": f["article"]["title"],
            "source": f["article"]["source"],
            "section": f["article"]["section"],
            "is_mock": f["article"]["is_mock"],
        }
        for f in FIXTURES
    ]
    assert [s["is_mock"] for s in samples] == [False, True, True, True]


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda f: f["article"]["url"])
def test_fixture_url_returns_fixture_unchanged(fixture):
    for variant in url_variants(fixture["article"]["url"]):
        r = client.post("/analyze", json={"url": variant})
        assert r.status_code == 200, variant
        assert r.json() == fixture, variant


def test_fixture_url_wins_over_supplied_text():
    r = client.post("/analyze", json={"url": LINE3["article"]["url"], "text": "ignored " * 50})
    assert r.json() == LINE3


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda f: f["article"]["url"])
def test_fixtures_satisfy_invariants(fixture):
    check_analysis(fixture)


def test_pasted_line3_text_gets_annotated():
    article = LINE3["article"]
    r = client.post("/analyze", json={"text": article["text"]})
    assert r.status_code == 200
    data = r.json()
    check_analysis(data)

    assert data["model"]["name"] == "keyword-rules"
    assert data["warnings"][0]["code"] == "KEYWORD_RULES"
    assert data["article"]["origin"] == "pasted"
    assert data["article"]["url"] == ""
    assert data["article"]["source"] == "Pasted text"
    assert data["article"]["title"] == "Untitled article"
    assert data["article"]["is_mock"] is True
    assert data["article"]["truncated"] is False
    assert data["article"]["text"] == article["text"]  # already normalised: "\n\n" between paragraphs
    assert data["article"]["word_count"] == article["word_count"]
    assert data["request_id"].startswith("req_local_")
    assert data["main_claim_id"] == "C1"
    assert len(data["components"]) >= 2 and data["relations"]


def test_pasted_text_uses_title_and_source_label():
    r = client.post(
        "/analyze",
        json={"text": LINE3["article"]["text"], "title": LINE3["article"]["title"], "source_label": "Uploaded file: x.txt"},
    )
    data = r.json()
    assert data["article"]["title"] == LINE3["article"]["title"]
    assert data["article"]["source"] == "Uploaded file: x.txt"
    check_analysis(data)


def test_unknown_url_with_text_is_page_origin():
    url = "https://news.example.com/some/other-article?id=7"
    r = client.post("/analyze", json={"url": url, "text": LINE3["article"]["text"]})
    assert r.status_code == 200
    data = r.json()
    check_analysis(data)
    assert data["article"]["origin"] == "page"
    assert data["article"]["url"] == url
    assert data["article"]["source"] == "This page"
    assert data["latency_ms"] >= 0 and data["latency_ms"] != 1400  # measured, not the JS placeholder


def test_too_short_text_is_422_no_article_content():
    r = client.post("/analyze", json={"text": "only ten words here, nowhere near enough to analyze really"})
    assert len("only ten words here, nowhere near enough to analyze really".split()) == 10
    assert r.status_code == 422
    assert r.json() == NO_CONTENT


def test_empty_body_and_unknown_url_without_text_are_422_no_article_content():
    for body in ({}, {"text": None, "url": None}, {"url": "https://nowhere.example.com/x"}, {"text": "   \n\t "}):
        r = client.post("/analyze", json=body)
        assert r.status_code == 422, body
        assert r.json() == NO_CONTENT, body


def test_29_words_rejected_30_accepted():
    sentence = "one two three four five six seven eight nine ten."
    twenty_nine = " ".join([sentence] * 2) + " one two three four five six seven eight nine."
    assert len(twenty_nine.split()) == 29
    assert client.post("/analyze", json={"text": twenty_nine}).status_code == 422
    assert client.post("/analyze", json={"text": twenty_nine + " ten"}).status_code == 200


def test_no_sentences_is_422_no_sentences():
    text = " ".join(["Hi."] * 40)  # 40 words, but no sentence has 5 words
    r = client.post("/analyze", json={"text": text})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "NO_SENTENCES"
    assert set(r.json()) == {"error"}


def test_text_over_5000_words_is_truncated_with_warning():
    sentence = "The city council should approve the new transit plan because the data shows clear savings."
    text = " ".join([sentence] * 500)  # 7,500 words
    r = client.post("/analyze", json={"text": text})
    assert r.status_code == 200
    data = r.json()
    check_analysis(data)
    assert data["article"]["truncated"] is True
    assert data["article"]["word_count"] == 5000
    assert "TRUNCATED" in [w["code"] for w in data["warnings"]]
    assert len(data["components"]) <= 24


def test_malformed_body_uses_same_error_shape():
    r = client.post("/analyze", json={"text": 123})
    assert r.status_code == 422
    assert set(r.json()) == {"error"}
    assert r.json()["error"]["code"] == "INVALID_REQUEST"
    r = client.post("/analyze", content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.parametrize("origin", ["http://localhost:5173", "chrome-extension://abcdefghijklmnopabcdefghijklmnop"])
def test_cors(origin):
    pre = client.options(
        "/analyze",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert pre.status_code == 200
    assert pre.headers["access-control-allow-origin"] == "*"
    assert "content-type" in pre.headers["access-control-allow-headers"].lower()
    assert "POST" in pre.headers["access-control-allow-methods"]
    assert "access-control-allow-credentials" not in pre.headers

    r = client.get("/health", headers={"Origin": origin})
    assert r.headers["access-control-allow-origin"] == "*"
    assert "access-control-allow-credentials" not in r.headers
