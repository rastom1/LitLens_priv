import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Lock, RotateCw } from "lucide-react";
import { LensMark } from "../components/Brand";

/** A stand-in browser window: the article on the left, the LitLens side panel on the right. */
export function BrowserFrame({
  url,
  tabTitle,
  onNavigate,
  page,
  panel,
  wide,
}: {
  url: string;
  tabTitle: string;
  onNavigate(url: string): void;
  page: ReactNode;
  panel: ReactNode;
  /** Give the panel more room (graph view). */
  wide: boolean;
}) {
  const [draft, setDraft] = useState(url);
  useEffect(() => setDraft(url), [url]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) onNavigate(draft.trim());
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)] lg:h-full">
      {/* tab strip */}
      <div className="flex items-end gap-2 bg-bg px-3 pt-2">
        <span className="mr-1 hidden gap-1.5 self-center sm:flex" aria-hidden>
          <i className="size-2.5 rounded-full bg-line-strong" />
          <i className="size-2.5 rounded-full bg-line-strong" />
          <i className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="flex max-w-72 min-w-0 items-center gap-2 rounded-t-lg border border-b-0 border-line bg-surface px-3 py-1.5 text-[12px] text-fg-2">
          <span className="size-3 shrink-0 rounded-sm bg-fg-3/40" />
          <span className="truncate">{tabTitle}</span>
        </span>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 border-y border-line bg-surface px-3 py-2">
        <span className="hidden gap-1 text-fg-3 sm:flex" aria-hidden>
          <ArrowLeft className="size-4" />
          <ArrowRight className="size-4" />
          <RotateCw className="size-4" />
        </span>
        <form onSubmit={submit} className="flex min-w-0 flex-1">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-bg px-3 transition-colors focus-within:border-claim-ink">
            <Lock className="size-3 shrink-0 text-fg-3" />
            <span className="sr-only">Article URL</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              placeholder="Paste an article URL and press Enter"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-fg-2 outline-none placeholder:text-fg-3"
            />
          </label>
        </form>
        <span className="grid size-8 place-items-center rounded-md bg-claim/15 text-fg" title="LitLens is open">
          <LensMark size={18} />
        </span>
      </div>

      {/* page + side panel */}
      <div
        className={
          "grid min-h-0 flex-1 lg:grid-rows-1 " +
          (wide ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(380px,470px)]")
        }
      >
        <div className="paper min-h-0 lg:overflow-auto">{page}</div>
        <div className="min-h-0 border-t border-line bg-bg lg:overflow-auto lg:border-t-0 lg:border-l">{panel}</div>
      </div>
    </div>
  );
}
