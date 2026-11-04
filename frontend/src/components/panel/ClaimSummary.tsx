import { useSelection, useStateOf } from "../../state/selection";
import { Confidence, Mono, cn } from "../ui/primitives";

/** The main claim, and how the rest of the article lines up behind or against it. */
export function ClaimSummary() {
  const { ix, select, setHover } = useSelection();
  const main = ix.comps.get(ix.mainId)!;
  const st = useStateOf(main.id);
  const { backs, against, low } = ix.counts;
  const total = backs + against || 1;

  return (
    <button
      type="button"
      onClick={() => select(main.id, "panel")}
      onMouseEnter={() => setHover(main.id)}
      onMouseLeave={() => setHover(null)}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border bg-surface p-4 text-left transition-[border-color,box-shadow,opacity] duration-150 cursor-pointer animate-rise",
        st.isActive ? "border-claim-ink shadow-[0_0_0_1px_var(--claim-ink)]" : st.isHover ? "border-line-strong" : "border-line",
        st.isDimmed && "opacity-60",
      )}
    >
      {/* highlighter stroke along the top edge */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-claim" />
      <span className="flex items-center gap-2">
        <span aria-hidden className="size-2 rotate-45 rounded-[1px] bg-claim" />
        <Mono className="font-medium tracking-[0.12em] text-claim-ink uppercase">Main claim</Mono>
        <Mono className="text-fg-3">{main.id}</Mono>
        <span className="ml-auto">
          <Confidence value={main.confidence} />
        </span>
      </span>
      <p className="mt-2.5 font-read text-[20px] leading-[1.3] text-fg text-balance">{main.text}</p>

      <span className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className="bg-support transition-[flex-grow] duration-500" style={{ flexGrow: backs / total }} />
        <span className="w-0.5 shrink-0 bg-surface" />
        <span className="bg-attack transition-[flex-grow] duration-500" style={{ flexGrow: against / total }} />
      </span>
      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-2">
        <span>
          <Mono className="text-[12.5px] font-semibold text-support-ink">{backs}</Mono> back it
        </span>
        <span>
          <Mono className="text-[12.5px] font-semibold text-attack-ink">{against}</Mono> push against it
        </span>
        {low > 0 && (
          <span>
            <Mono className="text-[12.5px] font-semibold text-caution">{low}</Mono> low confidence
          </span>
        )}
      </span>
    </button>
  );
}
