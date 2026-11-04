import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useSelection } from "../../state/selection";
import { ArgumentCard } from "./ArgumentCard";
import { Mono, cn } from "../ui/primitives";
import "./tree.css";

function TreeNode({ id }: { id: string }) {
  const { ix, active, pathSet } = useSelection();
  const kids = ix.kids.get(id) ?? [];
  const [collapsed, setCollapsed] = useState(false);
  // Never hide the selected component inside a folded branch.
  const holdsActive = !!active && active !== id && ix.path(active).includes(id);
  const open = !collapsed || holdsActive;

  return (
    <li data-rel={ix.role(id)} className={cn((pathSet.has(id) || active === id) && "on-path")}>
      <ArgumentCard id={id} />
      {kids.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setCollapsed(open)}
            className="mt-1 ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-fg-3 transition-colors hover:bg-hover hover:text-fg-2 cursor-pointer"
          >
            <ChevronRight className={cn("size-3 transition-transform duration-150", open && "rotate-90")} />
            {kids.length} {kids.length === 1 ? "reply" : "replies"} to {id}
          </button>
          {open && (
            <ul>
              {kids.map((k) => (
                <TreeNode key={k} id={k} />
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

export function ArgumentTree() {
  const { ix, revealKey } = useSelection();
  const top = ix.kids.get(ix.mainId) ?? [];

  return (
    <div key={revealKey} className="flex flex-col gap-6">
      <section>
        <div className="flex items-center gap-2 pl-1">
          <span aria-hidden className="size-2 rotate-45 rounded-[1px] bg-claim" />
          <Mono className="text-fg-2">{ix.mainId}</Mono>
          <span className="text-[12.5px] text-fg-3">Main claim, and what responds to it</span>
        </div>
        {top.length ? (
          <ul className="ll-tree ml-2">
            {top.map((id) => (
              <TreeNode key={id} id={id} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-[12.5px] text-fg-3">
            The model found nothing that supports or attacks the main claim.
          </p>
        )}
      </section>

      {ix.orphans.length > 0 && (
        <section>
          <div className="flex items-center justify-between pl-1">
            <span className="text-[12.5px] text-fg-3">Not connected to the main claim</span>
            <Mono className="text-fg-3">{ix.orphans.length}</Mono>
          </div>
          <ul className="ll-tree ml-2">
            {ix.orphans
              .filter((id) => !ix.parent.has(id) || !ix.orphans.includes(ix.parent.get(id)!.target))
              .map((id) => (
                <TreeNode key={id} id={id} />
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
