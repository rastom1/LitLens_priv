import { motion } from "motion/react";
import { X } from "lucide-react";
import { useSelection } from "../../state/selection";
import { IconButton, Mono, cn } from "../ui/primitives";

/** Breadcrumb from the main claim down to the selected component, with its net effect. */
export function PathBar() {
  const { ix, active, select } = useSelection();
  if (!active) return null;

  const path = ix.path(active).reverse();
  const stance = ix.stance(active);
  const flips = path.filter((id) => ix.parent.get(id)?.type === "attack").length;
  const net =
    stance === "main"
      ? "This is the main claim."
      : stance === "unlinked"
        ? "Not connected to the main claim."
        : stance === "backs"
          ? flips >= 2
            ? "Net effect: backs the main claim, by pushing back on a counter-argument."
            : "Net effect: backs the main claim."
          : "Net effect: argues against the main claim.";

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      className="sticky top-[58px] z-10 rounded-xl border border-line-strong bg-elevated/95 p-3 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2">
        <Mono className="tracking-[0.12em] text-fg-3 uppercase">Path to main claim</Mono>
        <IconButton label="Clear selection (Esc)" className="size-6" onClick={() => select(null, "panel")}>
          <X className="size-3.5" />
        </IconButton>
      </div>
      <ol className="mt-1.5 flex flex-wrap items-center gap-1">
        {path.map((id, i) => {
          const rel = ix.parent.get(id);
          return (
            <li key={id} className="flex items-center gap-1">
              {i > 0 && <span className="text-fg-3">›</span>}
              <button
                type="button"
                onClick={() => select(id, "panel")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] transition-colors cursor-pointer",
                  id === active ? "border-fg bg-surface text-fg" : "border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                <Mono className="text-[10.5px] text-fg-3">{id}</Mono>
                {ix.label(id)}
                {rel && (
                  <span className={cn("text-[11px] font-semibold", rel.type === "support" ? "text-support-ink" : "text-attack-ink")}>
                    {rel.type === "support" ? "supports" : "attacks"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <p className={cn("mt-2 text-[12.5px]", stance === "against" ? "text-attack-ink" : stance === "backs" ? "text-support-ink" : "text-fg-2")}>
        {net}
      </p>
    </motion.div>
  );
}
