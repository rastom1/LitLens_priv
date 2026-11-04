import { lazy, Suspense, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { ListTree, Network } from "lucide-react";
import { useSelection, type Filter, type View } from "../../state/selection";
import { ClaimSummary } from "./ClaimSummary";
import { WarningList } from "./WarningList";
import { PathBar } from "./PathBar";
import { ArgumentTree } from "./ArgumentTree";
import { FactCheck, RunDetails } from "./Extras";
import { Mono, Segmented } from "../ui/primitives";

// Cytoscape is most of the bundle; only load it when someone opens the graph.
const ArgumentGraph = lazy(() => import("./ArgumentGraph").then((m) => ({ default: m.ArgumentGraph })));

/** Everything below the panel header. Used by both the walkthrough and the extension. */
export function ArgumentPanel() {
  const { ix, active, view, setView, filter, setFilter, select } = useSelection();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active) select(null, "panel");
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active, select]);

  const { support, attack } = ix.counts;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-fg-3">
        <span className="size-1.5 rounded-full bg-support" />
        <Mono>{ix.resp.status === "complete" ? "complete" : "partial"}</Mono>
        <Mono>·</Mono>
        <Mono>
          {ix.resp.components.length} parts · {ix.resp.relations.length} links
        </Mono>
      </div>

      <ClaimSummary />
      <WarningList />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "tree", label: <><ListTree className="size-3.5" /> Tree</> },
            { value: "graph", label: <><Network className="size-3.5" /> Graph</> },
          ]}
        />
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "support", label: <>Supports <Mono className="text-support-ink">{support}</Mono></> },
            { value: "attack", label: <>Attacks <Mono className="text-attack-ink">{attack}</Mono></> },
          ]}
        />
      </div>

      <AnimatePresence>{active && <PathBar key="path" />}</AnimatePresence>

      {view === "tree" ? (
        <ArgumentTree />
      ) : (
        <Suspense fallback={<div className="h-[min(68vh,620px)] animate-pulse rounded-xl border border-line bg-surface" />}>
          <ArgumentGraph />
        </Suspense>
      )}

      <FactCheck />
      <RunDetails />
    </div>
  );
}
