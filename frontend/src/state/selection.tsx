import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ArgIndex } from "../lib/argument";

export type Filter = "all" | "support" | "attack";
export type View = "tree" | "graph";
/** Where a selection came from, so hosts know whether to scroll the article. */
export type Origin = "panel" | "graph" | "article";

interface Selection {
  ix: ArgIndex;
  active: string | null;
  hover: string | null;
  filter: Filter;
  view: View;
  /** Bumped by "Replay" to re-run the reveal animation. */
  revealKey: number;
  /** Parent and children of the active component. */
  related: Set<string>;
  /** Ancestors of the active component, up to the main claim. */
  pathSet: Set<string>;
  select(id: string | null, origin: Origin): void;
  setHover(id: string | null): void;
  setFilter(f: Filter): void;
  setView(v: View): void;
  replay(): void;
}

const Ctx = createContext<Selection | null>(null);

const VIEW_KEY = "litlens-view";
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "graph" ? "graph" : "tree";
  } catch {
    return "tree";
  }
};

interface Props {
  ix: ArgIndex;
  children: ReactNode;
  /** Host hook: scroll the article / message the content script. */
  onSelect?(id: string | null, origin: Origin): void;
  onHover?(id: string | null): void;
}

export function SelectionProvider({ ix, children, onSelect, onHover }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHoverState] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setViewState] = useState<View>(savedView);
  const [revealKey, setRevealKey] = useState(0);

  const select = useCallback(
    (id: string | null, origin: Origin) => {
      const next = id === active ? null : id;
      setActive(next);
      onSelect?.(next, origin);
    },
    [active, onSelect],
  );

  const setHover = useCallback(
    (id: string | null) => {
      setHoverState(id);
      onHover?.(id);
    },
    [onHover],
  );

  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not persisted */
    }
  }, []);

  const value = useMemo<Selection>(() => {
    const related = new Set<string>();
    const pathSet = new Set<string>();
    if (active) {
      const p = ix.parent.get(active);
      if (p) related.add(p.target);
      for (const k of ix.kids.get(active) ?? []) related.add(k);
      for (const id of ix.path(active).slice(1)) pathSet.add(id);
    }
    return {
      ix,
      active,
      hover,
      filter,
      view,
      revealKey,
      related,
      pathSet,
      select,
      setHover,
      setFilter,
      setView,
      replay: () => setRevealKey((k) => k + 1),
    };
  }, [ix, active, hover, filter, view, revealKey, select, setHover, setView]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSelection must be used inside <SelectionProvider>");
  return s;
}

/** Classes shared by every view of one component (mark, card, graph node). */
export function useStateOf(id: string) {
  const { active, hover, related, pathSet } = useSelection();
  return {
    isActive: active === id,
    isHover: hover === id,
    isRelated: related.has(id),
    isPath: pathSet.has(id),
    isDimmed: active !== null && active !== id && !related.has(id) && !pathSet.has(id),
  };
}
