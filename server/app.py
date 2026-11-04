"""LitLens mock backend (FastAPI).

Run from this directory:  .venv/bin/python app.py   (or: .venv/bin/uvicorn app:app --port 8008)
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import annotator

MIN_WORDS = 30
FIXTURE_DIR = Path(__file__).parent / "fixtures"


# --- model seam ----------------------------------------------------------------------
# The ML team swaps this block for real model inference. Keep the signature and the
# return shape (the /analyze response schema, with article.url left as "" and
# latency_ms as a placeholder -- the endpoint fills both in). Return None if the text
# contains no analyzable sentences. Keep MODEL_INFO in step: /health reports it.

MODEL_INFO = annotator.MODEL


def analyze_text(text: str, title: str | None, source_label: str, origin: str) -> dict | None:
    return annotator.annotate(text, title, source_label, origin)


# --- fixtures --------------------------------------------------------------------------

def norm_url(u: str) -> str:
    """Same normalisation as the prototype's JS `norm`."""
    u = annotator.js_trim(u).lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = re.sub(r"[?#][^\n\r  ]*\Z", "", u)
    return re.sub(r"/+\Z", "", u)


FIXTURES: list[dict] = [
    json.loads(p.read_text(encoding="utf-8")) for p in sorted(FIXTURE_DIR.glob("*.json"))
]
FIXTURES_BY_URL: dict[str, dict] = {norm_url(f["article"]["url"]): f for f in FIXTURES}


# --- app -------------------------------------------------------------------------------

app = FastAPI(title="LitLens mock API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # http://localhost:5173 and chrome-extension://<id>; no credentials are sent
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)


class AnalyzeRequest(BaseModel):
    url: str | None = None
    title: str | None = None
    text: str | None = None
    source_label: str | None = None


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@app.exception_handler(RequestValidationError)
async def _invalid_request(_: Request, __: RequestValidationError) -> JSONResponse:
    # Keep one error shape for every 422 instead of FastAPI's default {"detail": [...]}.
    return _error(
        422,
        "INVALID_REQUEST",
        "Body must be JSON with optional string fields: url, title, text, source_label.",
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": MODEL_INFO}


@app.get("/samples")
def samples() -> list[dict]:
    return [
        {
            "url": a["url"],
            "title": a["title"],
            "source": a["source"],
            "section": a["section"],
            "is_mock": a["is_mock"],
        }
        for a in (f["article"] for f in FIXTURES)
    ]


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> JSONResponse:
    url = annotator.js_trim(req.url or "")
    if url:
        fixture = FIXTURES_BY_URL.get(norm_url(url))
        if fixture is not None:
            return JSONResponse(fixture)

    text = req.text or ""
    if annotator.count_words(text) < MIN_WORDS:
        return _error(422, "NO_ARTICLE_CONTENT", "LitLens needs at least 30 words of article text.")

    started = time.perf_counter()
    result = analyze_text(
        text,
        annotator.js_trim(req.title or "") or None,
        req.source_label or ("This page" if url else "Pasted text"),
        "page" if url else "pasted",
    )
    if result is None:
        return _error(422, "NO_SENTENCES", "LitLens couldn't find any full sentences in that text.")
    result["article"]["url"] = url
    result["latency_ms"] = round((time.perf_counter() - started) * 1000)
    return JSONResponse(result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8008")))
