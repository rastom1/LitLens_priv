import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ClipboardPaste, Moon, Sun } from "lucide-react";
import { listSamples, ApiError, API_BASE } from "../lib/api";
import { buildIndex } from "../lib/argument";
import type { Sample } from "../lib/types";
import { useAnalysis } from "../lib/useAnalysis";
import { useTheme } from "../lib/theme";
import { SelectionProvider, useSelection, type Origin } from "../state/selection";
import { Brand } from "../components/Brand";
import { ArticleView } from "../components/article/ArticleView";
import { ArgumentPanel } from "../components/panel/ArgumentPanel";
import { AnalyzingState, ErrorState } from "../components/panel/States";
import { PasteDialog } from "../components/PasteDialog";
import { Button, IconButton, Mono, cn } from "../components/ui/primitives";
import { BrowserFrame } from "./BrowserFrame";

const shortTitle = (t: string) => (t.length > 34 ? t.slice(0, 32).replace(/\s+\S*$/, "") + "…" : t);

/** In the walkthrough the article lives in this document, so "locate" is a scroll. */
function locateMark(id: string | null, origin: Origin) {
  if (!id || origin === "article") return;
  const m = document.querySelector<HTMLElement>(`mark[data-id="${CSS.escape(id)}"]`);
  if (!m) return;
  m.scrollIntoView({ behavior: "smooth", block: "center" });
  m.classList.remove("is-flash");
  void m.offsetWidth;
  m.classList.add("is-flash");
}

function PanelHeader() {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/90 px-5 py-3 backdrop-blur">
      <h2 className="font-display text-[15px] font-semibold tracking-tight">Argument map</h2>
      <Mono className="ml-auto text-fg-3">side panel</Mono>
    </div>
  );
}

function WideAware({ children }: { children(wide: boolean): ReactNode }) {
  const { view } = useSelection();
  return <>{children(view === "graph")}</>;
}

export function App() {
  const { theme, toggle } = useTheme();
  const { state, run } = useAnalysis({ minMs: 900 });
  const [samples, setSamples] = useState<Sample[]>([]);
  const [samplesError, setSamplesError] = useState<ApiError | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const openUrl = useCallback((url: string) => run({ url }), [run]);

  useEffect(() => {
    listSamples()
      .then((s) => {
        setSamples(s);
        if (s[0]) openUrl(s[0].url);
      })
      .catch((e: ApiError) => setSamplesError(e));
  }, [openUrl]);

  const ix = useMemo(() => (state.status === "done" ? buildIndex(state.resp) : null), [state]);
  const currentUrl = state.status === "idle" ? "" : state.req.url ?? (state.req.text ? `pasted text${state.req.source_label && state.req.source_label !== "Pasted text" ? ` (${state.req.source_label})` : ""}` : "");
  const tabTitle = ix?.resp.article.title ?? (state.status === "loading" ? "Loading…" : "New tab");

  const apiDown = samplesError ?? (state.status === "error" && state.error.code === "API_UNREACHABLE" ? state.error : null);

  const pageBody =
    state.status === "done" ? (
      <ArticleView />
    ) : state.status === "loading" ? (
      <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-6 pt-16" aria-hidden>
        <i className="h-3 w-40 animate-pulse rounded bg-[var(--paper-line)]" />
        <i className="h-9 w-[85%] animate-pulse rounded bg-[var(--paper-line)]" />
        <i className="h-9 w-[60%] animate-pulse rounded bg-[var(--paper-line)]" />
        {[100, 96, 99, 70, 0, 100, 92, 98, 64].map((w, i) => (
          <i key={i} className="h-3.5 animate-pulse rounded bg-[var(--paper-line)]" style={{ width: `${w}%`, opacity: w ? 1 : 0 }} />
        ))}
      </div>
    ) : (
      <div className="grid h-full place-items-center p-10 text-center font-sans text-[14px] text-[var(--paper-muted)]">
        {state.status === "error" ? "This page has no article LitLens can read." : "Pick a sample article above."}
      </div>
    );

  const panelBody = apiDown ? (
    <ErrorState title="The LitLens API isn't running" message={`The walkthrough gets its analyses from the mock backend at ${API_BASE}. Start it, then reload this page.`} code={apiDown.code}>
      <pre className="overflow-x-auto rounded-md border border-line bg-bg p-2.5 font-mono text-[11.5px] text-fg">cd litlens/server{"\n"}.venv/bin/uvicorn app:app --port 8008</pre>
    </ErrorState>
  ) : state.status === "loading" ? (
    <AnalyzingState />
  ) : state.status === "error" ? (
    state.error.code === "NO_ARTICLE_CONTENT" ? (
      <ErrorState
        title="No article to analyze at that address"
        message="The walkthrough only knows the sample articles. To map a live page, use the browser extension on it, or paste the article's text here."
        code={`${state.error.status} · ${state.error.code}`}
      >
        <Button variant="primary" className="self-start" icon={<ClipboardPaste className="size-3.5" />} onClick={() => setPasteOpen(true)}>
          Paste the text
        </Button>
      </ErrorState>
    ) : (
      <ErrorState title="Analysis failed" message={state.error.message} code={`${state.error.status || ""} ${state.error.code}`.trim()} />
    )
  ) : state.status === "done" ? (
    <ArgumentPanel />
  ) : null;

  const frame = (wide: boolean) => (
    <BrowserFrame
      url={currentUrl}
      tabTitle={tabTitle}
      onNavigate={openUrl}
      wide={wide}
      page={pageBody}
      panel={
        <>
          <PanelHeader />
          <div className="px-5 py-4">{panelBody}</div>
        </>
      }
    />
  );

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-3.5 lg:px-8">
        <Brand tag="walkthrough · mock model" />
        <nav
          aria-label="Sample articles"
          className="order-last -mx-1 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto px-1 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:flex-wrap lg:px-0"
        >
          {samples.map((s, i) => {
            const on = state.status !== "idle" && state.req.url === s.url;
            return (
              <button
                key={s.url}
                type="button"
                onClick={() => openUrl(s.url)}
                aria-pressed={on}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[12.5px] transition-colors cursor-pointer",
                  on ? "border-line-strong bg-elevated text-fg" : "border-transparent text-fg-2 hover:bg-hover hover:text-fg",
                )}
              >
                <Mono className={on ? "text-claim-ink" : "text-fg-3"}>0{i + 1}</Mono>
                {shortTitle(s.title)}
                {!s.is_mock && <Mono className="rounded bg-support/15 px-1 text-support-ink">real</Mono>}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-1.5">
          <Button icon={<ClipboardPaste className="size-3.5" />} onClick={() => setPasteOpen(true)}>
            Paste or upload
          </Button>
          <IconButton label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-3 pb-3 lg:px-8 lg:pb-6">
        {ix ? (
          <SelectionProvider key={ix.resp.request_id} ix={ix} onSelect={locateMark}>
            <WideAware>{frame}</WideAware>
          </SelectionProvider>
        ) : (
          frame(false)
        )}
      </main>

      <PasteDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(req) => {
          setPasteOpen(false);
          run(req);
        }}
      />
    </div>
  );
}
