// Runs in the article tab. Injected on demand by the side panel (never on
// page load), so it only touches pages the reader asked LitLens to analyze.
import type { Extracted, FromContent, HighlightItem, HighlightResult, ToContent } from "./messages";

const SKIP = "nav, footer, aside, header, form, [role=navigation], [aria-hidden=true]";
const MARK = "mark.litlens-mark";
const glyph = { main: "◆", support: "+", attack: "−", none: "·" } as const;

const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

let blocks: HTMLElement[] = [];

function findBlocks() {
  const root = document.querySelector("article") ?? document.querySelector("main") ?? document.body;
  return [...root.querySelectorAll<HTMLElement>("p, li, blockquote")].filter(
    (el) => !el.closest(SKIP) && !el.querySelector("p") && clean(el.textContent).length >= 40,
  );
}

function pageTitle() {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  return clean(og || document.querySelector("h1")?.textContent || document.title);
}

/** Whitespace-collapsed text plus, for each of its characters, the index in the raw text. */
function collapse(raw: string) {
  let out = "";
  const map: number[] = [];
  let space = true;
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) {
      if (!space) {
        out += " ";
        map.push(i);
        space = true;
      }
    } else {
      out += raw[i];
      map.push(i);
      space = false;
    }
  }
  return { out, map };
}

function locate(text: string) {
  const needle = clean(text);
  for (const el of blocks) {
    const { out, map } = collapse(el.textContent ?? "");
    const i = out.indexOf(needle);
    if (i >= 0) return { el, start: map[i], end: map[i + needle.length - 1] + 1 };
  }
  return null;
}

/** Wrap characters [start, end) of el's text in <mark>s, even across inline tags. */
function wrap(el: HTMLElement, start: number, end: number, item: HighlightItem) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const targets: [Text, number, number][] = [];
  let pos = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.data.length;
    const s = Math.max(start, pos);
    const e = Math.min(end, pos + len);
    if (s < e) targets.push([node, s - pos, e - pos]);
    pos += len;
    if (pos >= end) break;
  }
  targets.forEach(([node, s, e], i) => {
    let n = node;
    if (s > 0) n = n.splitText(s);
    if (e - s < n.data.length) n.splitText(e - s);
    const mark = document.createElement("mark");
    mark.className = `litlens-mark ${item.role}${item.low ? " low" : ""}`;
    mark.dataset.litlensId = item.id;
    mark.title = `LitLens · ${item.label}${item.role === "support" || item.role === "attack" ? ` (${item.role}s)` : ""}`;
    if (i === 0) mark.dataset.code = `${glyph[item.role]} ${item.id}`;
    n.parentNode!.insertBefore(mark, n);
    mark.appendChild(n);
  });
}

function clear() {
  const parents = new Set<Node>();
  document.querySelectorAll(MARK).forEach((m) => {
    parents.add(m.parentNode!);
    m.replaceWith(...m.childNodes);
  });
  parents.forEach((p) => p.normalize());
  document.documentElement.classList.remove("litlens-focusing");
}

const marksOf = (id: string) => document.querySelectorAll<HTMLElement>(`${MARK}[data-litlens-id="${CSS.escape(id)}"]`);

function setState(active: string | null, related: string[], path: string[], scroll: boolean) {
  document.querySelectorAll(MARK).forEach((m) => m.classList.remove("is-active", "is-related", "is-path"));
  document.documentElement.classList.toggle("litlens-focusing", !!active);
  if (!active) return;
  related.forEach((id) => marksOf(id).forEach((m) => m.classList.add("is-related")));
  path.forEach((id) => marksOf(id).forEach((m) => m.classList.add("is-path")));
  const own = marksOf(active);
  own.forEach((m) => m.classList.add("is-active"));
  if (scroll && own[0]) {
    own[0].scrollIntoView({ behavior: "smooth", block: "center" });
    own[0].classList.remove("is-flash");
    void own[0].offsetWidth;
    own[0].classList.add("is-flash");
  }
}

function send(msg: FromContent) {
  chrome.runtime.sendMessage(msg).catch(() => {
    /* side panel closed */
  });
}

function init() {
  chrome.runtime.onMessage.addListener((msg: ToContent, _sender, reply) => {
    switch (msg.type) {
      case "litlens:extract": {
        clear();
        blocks = findBlocks();
        const out: Extracted = { url: location.href, title: pageTitle(), paragraphs: blocks.map((b) => clean(b.textContent)) };
        reply(out);
        break;
      }
      case "litlens:highlight": {
        clear();
        const res: HighlightResult = { placed: [], missing: [] };
        for (const item of msg.items) {
          const at = locate(item.text);
          if (at) {
            wrap(at.el, at.start, at.end, item);
            res.placed.push(item.id);
          } else res.missing.push(item.id);
        }
        reply(res);
        break;
      }
      case "litlens:state":
        setState(msg.active, msg.related, msg.path, msg.scroll);
        break;
      case "litlens:hover":
        document.querySelectorAll(`${MARK}.is-hover`).forEach((m) => m.classList.remove("is-hover"));
        if (msg.id) marksOf(msg.id).forEach((m) => m.classList.add("is-hover"));
        break;
      case "litlens:clear":
        clear();
        break;
    }
  });

  // Capture phase so a highlight inside a link selects instead of navigating.
  document.addEventListener(
    "click",
    (e) => {
      const m = (e.target as Element | null)?.closest?.<HTMLElement>(MARK);
      if (!m) return;
      e.preventDefault();
      e.stopPropagation();
      send({ type: "litlens:select", id: m.dataset.litlensId! });
    },
    true,
  );
  document.addEventListener("mouseover", (e) => {
    const m = (e.target as Element | null)?.closest?.<HTMLElement>(MARK);
    send({ type: "litlens:page-hover", id: m?.dataset.litlensId ?? null });
  });
}

const w = window as Window & { __litlens?: boolean };
if (!w.__litlens) {
  w.__litlens = true;
  init();
}
