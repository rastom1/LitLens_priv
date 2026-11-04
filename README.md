# LitLens

LitLens shows the argument inside a news article: the **main claim**, the **premises** that support or attack it, and how they connect. It highlights them in the article and draws them as a tree or graph.

Labels currently come from a **mock backend**: keyword rules, plus four sample responses. The REST contract is the real one, so the ML pipeline can replace the mock without frontend changes.

```
litlens/
  server/     FastAPI mock of the analysis API (Python 3.12)
  frontend/   React + TypeScript: the web walkthrough AND the Chrome extension
```

## Run it

**1. API** (port 8008)

```bash
cd litlens/server
/opt/homebrew/bin/python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/python app.py
```

**2. Web walkthrough** (port 5173)

```bash
cd litlens/frontend
npm install   # first time only
npm run dev
```

Open http://localhost:5173. It has the four sample articles, Tree/Graph views, filters, the path-to-claim breadcrumb, and **Paste or upload** for your own text.

**3. Chrome extension**

```bash
cd litlens/frontend
npm run build
```

Then:
1. In `chrome://extensions`, turn on **Developer mode**.
2. Click **Load unpacked** and pick `litlens/frontend/dist`.
3. Open any news article, click the LitLens icon, then **Analyze this page**. The API must be running.

## How the pieces fit

```
article tab                         side panel (extension page)              server
-----------                         ---------------------------              ------
content.js  <-- litlens:extract --  sidepanel.tsx
            -- paragraphs ------->                --- POST /analyze ------>  app.py
                                                 <--- analysis JSON -----   analyze_text()
            <-- litlens:highlight -  (marks placed by matching text)
   click on a highlight -- litlens:select -->  selection state  -- litlens:state --> rings + dimming
```

- **The content script** (`src/extension/content.ts`) is injected only when you press Analyze, never on page load. It reads the paragraphs in `<article>`/`<main>`, skipping nav and footer. It places `<mark>`s by matching each component's text, so highlights survive inline links.
- **The panel UI** (`src/components/panel/*`) is shared by the walkthrough and the extension. Selection, hover, filter and view live in `src/state/selection.tsx`. Each host passes `onSelect`/`onHover` to sync its article.
- **The graph** (Cytoscape) is lazy-loaded, so the default Tree view doesn't pay for it.

## API contract (schema 1.0)

The types live in `frontend/src/lib/types.ts`.

`POST /analyze` takes `{ url?, title?, text?, source_label? }` and returns:

```jsonc
{
  "main_claim_id": "C1",
  "components": [{ "id": "C1", "type": "claim", "start": 0, "end": 134, "text": "…", "confidence": 0.93 }],
  "relations":  [{ "id": "R1", "source": "P1", "target": "C1", "type": "support", "confidence": 0.82 }],
  "article": { "title": "…", "text": "paragraphs joined by \\n\\n", … },
  "warnings": [{ "code": "LOW_CONFIDENCE", "message": "…", "ids": ["P1"] }],
  "suggested_queries": ["…"], "model": {…}, "latency_ms": 0, "status": "complete"
}
```

Rules the frontend relies on:
- **A tree:** each component is the `source` of at most one relation. `target` is the main claim or another component, which makes it a sub-premise. There are no cycles.
- **Offsets:** `start`/`end` are offsets into `article.text`, counted in Unicode code points (what Python gives you). The frontend converts them for JavaScript.
- **Opaque values:** treat ids and warning codes as opaque strings.
- **Errors:** they come back as `{"error": {"code", "message"}}`, for example 422 `NO_ARTICLE_CONTENT`.

**For the model team:** replace `analyze_text()` in `server/app.py`. Everything else (fixtures for the sample URLs, validation, CORS) stays.

## Tests

```bash
cd litlens/server && .venv/bin/python -m pytest -q   # API + annotator
cd litlens/frontend && npm test                      # argument-tree logic
cd litlens/frontend && npm run typecheck
```

## Known limits

- **Mock labels:** they come from keyword rules (ported from the first prototype), so expect mistakes on real articles.
- **Permissions:** the extension requests `<all_urls>` so it can read whichever tab you analyze. Narrow this before any release.
- **Icon:** there's no extension icon yet, so Chrome shows a letter placeholder.
- **Walkthrough URLs:** the walkthrough can't fetch arbitrary URLs. Only the sample URLs resolve; use the extension or paste the text for anything else.
