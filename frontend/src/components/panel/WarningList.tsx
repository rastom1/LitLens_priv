import { TriangleAlert } from "lucide-react";
import { useSelection } from "../../state/selection";
import { Mono } from "../ui/primitives";

export function WarningList() {
  const { ix, select } = useSelection();
  const warnings = ix.resp.warnings;
  if (!warnings.length) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {warnings.map((w) => (
        <li key={w.code} className="flex gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] leading-snug text-fg-2 animate-rise">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-caution" />
          <span className="flex flex-col gap-1">
            <Mono className="text-[10.5px] font-semibold tracking-[0.1em] text-caution uppercase">{w.code.replaceAll("_", " ")}</Mono>
            <span>{w.message}</span>
            {w.ids && w.ids.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {[...new Set(w.ids.map((id) => (ix.comps.has(id) ? id : ix.resp.relations.find((r) => r.id === id)?.source)))]
                  .filter((id): id is string => !!id)
                  .map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => select(id, "panel")}
                      className="rounded border border-line px-1.5 py-px font-mono text-[10.5px] text-fg-2 transition-colors hover:border-caution hover:text-fg cursor-pointer"
                    >
                      {id}
                    </button>
                  ))}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
