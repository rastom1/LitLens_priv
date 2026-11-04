import { useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";
import { useSelection, useStateOf } from "../../state/selection";
import { Confidence, Mono, cn } from "../ui/primitives";

export function ArgumentCard({ id }: { id: string }) {
  const { ix, filter, select, setHover } = useSelection();
  const st = useStateOf(id);
  const ref = useRef<HTMLButtonElement>(null);
  const comp = ix.comps.get(id)!;
  const rel = ix.parent.get(id);
  const role = ix.role(id);
  const low = ix.low(id);
  const filteredOut = filter !== "all" && role !== filter;
  const order = ix.order.indexOf(id);

  useEffect(() => {
    if (st.isActive) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [st.isActive]);

  return (
    <button
      ref={ref}
      type="button"
      data-id={id}
      onClick={() => select(id, "panel")}
      onMouseEnter={() => setHover(id)}
      onMouseLeave={() => setHover(null)}
      style={{ animationDelay: `${120 + order * 70}ms` }}
      className={cn(
        "group relative w-full rounded-[10px] border bg-surface py-2.5 pr-3 pl-4 text-left transition-[border-color,box-shadow,opacity,background] duration-150 cursor-pointer animate-rise",
        st.isActive
          ? "border-fg shadow-[0_0_0_1px_var(--fg)]"
          : st.isPath
            ? "border-dashed border-fg-2"
            : st.isHover || st.isRelated
              ? "border-line-strong bg-elevated"
              : "border-line hover:border-line-strong hover:bg-elevated",
        (st.isDimmed || filteredOut) && "opacity-40",
      )}
    >
      {/* relation rail */}
      <span
        aria-hidden
        className={cn(
          "absolute top-2.5 bottom-2.5 left-1.5 w-[3px] rounded-full",
          role === "support" ? "bg-support" : role === "attack" ? "bg-attack" : "bg-line-strong",
          low && "opacity-60",
        )}
      />
      <span className="flex items-center gap-2 text-[12px]">
        {rel && (
          <span
            className={cn(
              "grid size-4 place-items-center rounded-[4px]",
              rel.type === "support" ? "bg-support/15 text-support-ink" : "bg-attack/15 text-attack-ink",
            )}
          >
            {rel.type === "support" ? <Plus className="size-3" strokeWidth={3} /> : <Minus className="size-3" strokeWidth={3} />}
          </span>
        )}
        <span className="font-medium text-fg">{ix.label(id)}</span>
        {rel && (
          <span className={rel.type === "support" ? "text-support-ink" : "text-attack-ink"}>
            {rel.type === "support" ? "supports" : "attacks"} <Mono className="text-fg-3">{rel.target}</Mono>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2.5">
          <Mono className="text-fg-3">{id}</Mono>
          <Confidence value={Math.min(comp.confidence, rel?.confidence ?? 1)} />
        </span>
      </span>
      <p className="mt-1.5 font-read text-[15.5px] leading-[1.42] text-fg">{comp.text}</p>
      {low && (
        <span className="mt-2 inline-flex items-center rounded border border-dashed border-caution/60 px-1.5 py-px font-mono text-[10px] tracking-[0.08em] text-caution uppercase">
          Low confidence: check this one
        </span>
      )}
    </button>
  );
}
