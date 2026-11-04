import { useState, type KeyboardEvent, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { paragraphs } from "../../lib/argument";
import { useSelection } from "../../state/selection";
import { cn } from "../ui/primitives";

const glyph = { main: "◆", support: "+", attack: "−", none: "·" } as const;

function Highlight({ id }: { id: string }) {
  const { ix, active, hover, related, pathSet, select, setHover } = useSelection();
  const comp = ix.comps.get(id)!;
  const role = ix.role(id);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(id, "article");
    }
  };
  return (
    <mark
      data-id={id}
      tabIndex={0}
      title={`${ix.label(id)}${role === "support" || role === "attack" ? ` · ${role}s` : ""} · confidence ${comp.confidence.toFixed(2)}`}
      style={{ ["--i" as string]: ix.order.indexOf(id) }}
      className={cn(
        "ll",
        role,
        ix.low(id) && "low",
        hover === id && "is-hover",
        active === id && "is-active",
        related.has(id) && "is-related",
        pathSet.has(id) && "is-path",
      )}
      onClick={() => select(id, "article")}
      onKeyDown={onKey}
      onMouseEnter={() => setHover(id)}
      onMouseLeave={() => setHover(null)}
    >
      <span className="code" aria-hidden>
        {glyph[role]} {id}
      </span>
      {comp.text}
    </mark>
  );
}

function Legend({ plain, setPlain }: { plain: boolean; setPlain(v: boolean): void }) {
  const { replay } = useSelection();
  const sw = "inline-flex items-center gap-1.5";
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-8 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--paper-line)] bg-[var(--paper)]/95 px-6 py-2.5 font-sans text-[12px] text-[var(--paper-muted)] backdrop-blur">
      <span className={sw}>
        <i className="h-3 w-5 rounded-sm bg-[var(--hl-claim)] shadow-[inset_0_-2px_0_var(--ul-claim)]" /> Main claim
      </span>
      <span className={sw}>
        <i className="h-3 w-5 rounded-sm bg-[var(--hl-support)] shadow-[inset_0_-2px_0_var(--ul-support)]" /> Supports
      </span>
      <span className={sw}>
        <i className="h-3 w-5 rounded-sm bg-[var(--hl-attack)] shadow-[inset_0_-2px_0_var(--ul-attack)]" /> Attacks
      </span>
      <span className={sw}>
        <i className="h-3 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,transparent_0_4px,oklch(0.7_0.12_62/0.45)_4px_6px)]" /> Low confidence
      </span>
      <span className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setPlain(false);
            replay();
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--paper-ink)] transition-colors hover:bg-[var(--paper-line)] cursor-pointer"
        >
          <RotateCcw className="size-3" /> Replay
        </button>
        <label className="inline-flex items-center gap-1.5 text-[var(--paper-ink)] cursor-pointer">
          <input type="checkbox" checked={!plain} onChange={(e) => setPlain(!e.target.checked)} className="accent-[var(--paper-ink)]" />
          Highlights
        </label>
      </span>
    </div>
  );
}

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

/** The article as a reader would see it on the publisher's page, with LitLens highlights. */
export function ArticleView() {
  const { ix, active, filter, revealKey } = useSelection();
  const [plain, setPlain] = useState(false);
  const a = ix.resp.article;
  const sorted = [...ix.comps.values()].sort((x, y) => x.start - y.start);

  return (
    <article
      data-filter={filter}
      className={cn("mx-auto max-w-[680px] px-6 pb-20", active && "is-focusing", plain && "is-plain")}
    >
      <Legend plain={plain} setPlain={setPlain} />
      <p className="font-sans text-[12px] font-semibold tracking-[0.1em] text-[var(--paper-muted)] uppercase">
        {a.source}
        {a.section && <span className="text-[var(--ul-attack)]"> · {a.section}</span>}
      </p>
      <h1 className="mt-3 font-read text-[clamp(28px,3.2vw,40px)] leading-[1.1] font-semibold tracking-[-0.01em] text-balance">{a.title}</h1>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--paper-line)] pb-5 font-sans text-[13px] text-[var(--paper-muted)]">
        {a.author && <span>By {a.author}</span>}
        {a.published_at && <span>{fmtDate(a.published_at)}</span>}
        <span className="font-mono text-[12px]">{a.word_count} words</span>
        {a.is_mock && <span className="font-mono text-[12px]">fictional sample</span>}
      </p>

      <div key={revealKey} className="mt-7 flex flex-col gap-[1.1em] font-read text-[19px] leading-[1.72]">
        {paragraphs(a.text).map(({ start, end }) => {
          const parts: ReactNode[] = [];
          let pos = start;
          for (const c of sorted) {
            if (c.start < start || c.end > end || c.start < pos) continue;
            parts.push(a.text.slice(pos, c.start));
            parts.push(<Highlight key={c.id} id={c.id} />);
            pos = c.end;
          }
          parts.push(a.text.slice(pos, end));
          return (
            <p key={start} className="m-0">
              {parts}
            </p>
          );
        })}
      </div>

      {a.license && <p className="mt-10 border-t border-dashed border-[var(--paper-line)] pt-4 font-sans text-[12px] text-[var(--paper-muted)]">{a.license}</p>}
    </article>
  );
}
