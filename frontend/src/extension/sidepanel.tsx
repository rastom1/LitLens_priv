import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Moon, RefreshCw, ScanSearch, Sun } from "lucide-react";
import "../styles/globals.css";
import { API_BASE, ApiError } from "../lib/api";
import { buildIndex, type ArgIndex } from "../lib/argument";
import { useAnalysis } from "../lib/useAnalysis";
import { useTheme } from "../lib/theme";
import { SelectionProvider, useSelection, type Origin } from "../state/selection";
import { Brand } from "../components/Brand";
import { ArgumentPanel } from "../components/panel/ArgumentPanel";
import { AnalyzingState, ErrorState } from "../components/panel/States";
import { Button, IconButton, Mono } from "../components/ui/primitives";
import type { Extracted, FromContent, HighlightItem, HighlightResult, ToContent } from "./messages";

interface Tab {
  id: number;
  title: string;
  url: string;
}

const toTab = (id: number | undefined, message: ToContent) =>
  id == null ? Promise.resolve(undefined) : chrome.tabs.sendMessage(id, message).catch(() => undefined);

/** Relays clicks and hovers on page highlights into the shared selection. */
function PageBridge({ tabId }: { tabId: number }) {
  const { select, setHover } = useSelection();
  useEffect(() => {
    const onMsg = (msg: FromContent, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.id !== tabId) return;
      if (msg.type === "litlens:select") select(msg.id, "article");
      if (msg.type === "litlens:page-hover") setHover(msg.id);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, [tabId, select, setHover]);
  return null;
}

function SidePanelApp() {
  const { theme, toggle } = useTheme();
  const { state, run } = useAnalysis({ minMs: 600 });
  const [tab, setTab] = useState<Tab | null>(null);
  const [analyzedTab, setAnalyzedTab] = useState<number | null>(null);
  const [pageError, setPageError] = useState<{ title: string; message: string; code: string } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const analyzedRef = useRef<number | null>(null);
  analyzedRef.current = analyzedTab;

  const readActiveTab = useCallback(async () => {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    setTab(t?.id != null ? { id: t.id, title: t.title ?? "", url: t.url ?? "" } : null);
  }, []);

  const reset = useCallback(() => {
    setAnalyzedTab(null);
    setPageError(null);
    setMissing([]);
  }, []);

  // Track the active tab; a different tab or a navigation invalidates the map.
  useEffect(() => {
    readActiveTab();
    const onActivated = () => {
      readActiveTab();
      reset();
    };
    const onUpdated = (id: number, info: { status?: string; title?: string }) => {
      if (info.status === "loading" && id === analyzedRef.current) reset();
      if (info.title || info.status === "complete") readActiveTab();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [readActiveTab, reset]);

  const analyzePage = async () => {
    if (!tab) return;
    reset();
    setAnalyzedTab(tab.id);
    let page: Extracted | undefined;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      page = await chrome.tabs.sendMessage<ToContent, Extracted>(tab.id, { type: "litlens:extract" });
    } catch {
      setPageError({
        title: "LitLens can't read this page",
        message: "Chrome doesn't let extensions run on its own pages (chrome://, the Web Store, the new-tab page). Open a news article and try again.",
        code: "PAGE_BLOCKED",
      });
      return;
    }
    if (!page?.paragraphs.length) {
      setPageError({
        title: "No article found on this page",
        message: "LitLens looks for paragraphs inside the page's <article> or <main> and found none long enough. Open a news article and press Analyze again.",
        code: "NO_ARTICLE_CONTENT",
      });
      return;
    }
    run({ url: page.url, title: page.title, text: page.paragraphs.join("\n\n"), source_label: new URL(page.url).hostname });
  };

  const ix: ArgIndex | null = useMemo(() => (state.status === "done" && analyzedTab ? buildIndex(state.resp) : null), [state, analyzedTab]);

  // Paint the highlights once a result arrives.
  useEffect(() => {
    if (!ix || analyzedTab == null) return;
    const items: HighlightItem[] = ix.resp.components.map((c) => ({ id: c.id, text: c.text, role: ix.role(c.id), low: ix.low(c.id), label: ix.label(c.id) }));
    chrome.tabs
      .sendMessage<ToContent, HighlightResult>(analyzedTab, { type: "litlens:highlight", items })
      .then((r) => setMissing(r?.missing ?? []))
      .catch(() => setMissing(items.map((i) => i.id)));
  }, [ix, analyzedTab]);

  const onSelect = useCallback(
    (id: string | null, origin: Origin) => {
      if (!ix) return;
      const related = id ? [ix.parent.get(id)?.target, ...(ix.kids.get(id) ?? [])].filter((x): x is string => !!x) : [];
      toTab(analyzedTab ?? undefined, { type: "litlens:state", active: id, related, path: id ? ix.path(id).slice(1) : [], scroll: origin !== "article" });
    },
    [ix, analyzedTab],
  );
  const onHover = useCallback((id: string | null) => toTab(analyzedTab ?? undefined, { type: "litlens:hover", id }), [analyzedTab]);

  const host = (() => {
    try {
      return tab?.url ? new URL(tab.url).hostname : "";
    } catch {
      return "";
    }
  })();
  const busy = state.status === "loading";

  let body;
  if (pageError) body = <ErrorState {...pageError} />;
  else if (analyzedTab && state.status === "loading") body = <AnalyzingState />;
  else if (analyzedTab && state.status === "error")
    body =
      state.error.code === "API_UNREACHABLE" ? (
        <ErrorState title="The LitLens API isn't running" message={`The extension sends the article text to ${API_BASE}/analyze. Start the backend, then press Analyze again.`} code={state.error.code}>
          <pre className="overflow-x-auto rounded-md border border-line bg-bg p-2.5 font-mono text-[11.5px] text-fg">cd litlens/server{"\n"}.venv/bin/python app.py</pre>
        </ErrorState>
      ) : (
        <ErrorState title="Analysis failed" message={state.error.message} code={`${(state.error as ApiError).status || ""} ${state.error.code}`.trim()} />
      );
  else if (ix && analyzedTab)
    body = (
      <SelectionProvider key={ix.resp.request_id} ix={ix} onSelect={onSelect} onHover={onHover}>
        <PageBridge tabId={analyzedTab} />
        {missing.length > 0 && (
          <p className="mb-3 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-fg-3">
            {missing.length} of {ix.resp.components.length} highlights couldn't be placed on the page (the text may be split across elements). They still appear in the map.
          </p>
        )}
        <ArgumentPanel />
      </SelectionProvider>
    );
  else
    body = (
      <div className="flex flex-col gap-5 pt-2 animate-rise">
        <div className="rounded-xl border border-line bg-surface p-4">
          <Mono className="tracking-[0.12em] text-fg-3 uppercase">This tab</Mono>
          <p className="mt-1.5 line-clamp-2 font-display text-[16px] leading-snug font-semibold tracking-tight">{tab?.title || "No tab"}</p>
          {host && <Mono className="mt-1 block text-fg-3">{host}</Mono>}
          <Button variant="primary" className="mt-4 h-9 w-full justify-center" icon={<ScanSearch className="size-4" />} disabled={!tab || busy} onClick={analyzePage}>
            Analyze this page
          </Button>
        </div>
        <ul className="flex flex-col gap-2.5 px-1 text-[13px] text-fg-2">
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-2 shrink-0 rotate-45 rounded-[1px] bg-claim" /> LitLens finds the article's <b className="font-medium text-fg">main claim</b>.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-support" /> It marks the premises that <b className="font-medium text-support-ink">support</b> it…
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-attack" /> …and the ones that <b className="font-medium text-attack-ink">attack</b> it, then maps how they connect.
          </li>
        </ul>
        <p className="px-1 text-[12px] text-fg-3">The page text goes to the LitLens API at {API_BASE}. Nothing runs until you press Analyze.</p>
      </div>
    );

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur">
        <Brand />
        <span className="ml-auto" />
        {analyzedTab && (
          <IconButton label="Analyze again" onClick={analyzePage} disabled={busy}>
            <RefreshCw className="size-4" />
          </IconButton>
        )}
        <IconButton label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconButton>
      </header>
      <main className="flex-1 px-4 py-4">{body}</main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);
