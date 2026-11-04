import { useEffect, useRef } from "react";
import cytoscape, { type Core, type StylesheetJson } from "cytoscape";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { ArgIndex } from "../../lib/argument";
import { useSelection } from "../../state/selection";
import { IconButton } from "../ui/primitives";

const NODE_W = 210;
const NODE_H = 78;
const GAP_X = 70;
const GAP_Y = 18;

// Cytoscape can't parse oklch(), so resolve a token to rgb via a 1px canvas.
const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
function rgb(token: string, host: HTMLElement) {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  host.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const ctx = canvas!.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}

function graphStyle(host: HTMLElement): StylesheetJson {
  const t = (name: string) => rgb(name, host);
  return [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        width: NODE_W,
        height: NODE_H,
        "background-color": t("--surface"),
        "border-width": 1.5,
        "border-color": t("--border-strong"),
        label: "data(label)",
        "text-wrap": "wrap",
        "text-max-width": `${NODE_W - 22}px`,
        "font-size": 11.5,
        "font-family": "Inter Variable, system-ui, sans-serif",
        color: t("--fg"),
        "text-valign": "center",
        "text-halign": "center",
        "line-height": 1.35,
        "transition-property": "opacity, border-width, border-color",
        "transition-duration": 200,
      },
    },
    { selector: 'node[role = "main"]', style: { "background-color": t("--claim"), "border-color": t("--claim"), color: t("--on-claim"), "font-weight": 600 } },
    { selector: 'node[role = "support"]', style: { "border-color": t("--support"), "border-width": 2 } },
    { selector: 'node[role = "attack"]', style: { "border-color": t("--attack"), "border-width": 2 } },
    { selector: "node[?low]", style: { "border-style": "dashed" } },
    {
      selector: "edge",
      style: {
        width: 2,
        "curve-style": "taxi",
        "taxi-direction": "horizontal",
        "taxi-turn": "50%",
        "line-color": t("--support"),
        "target-arrow-shape": "triangle",
        "target-arrow-color": t("--support"),
        "arrow-scale": 0.9,
        "transition-property": "opacity, width",
        "transition-duration": 200,
      },
    },
    { selector: 'edge[rel = "attack"]', style: { "line-color": t("--attack"), "target-arrow-color": t("--attack"), "line-style": "dashed", "line-dash-pattern": [6, 4] } },
    { selector: "node.hover", style: { "border-width": 3 } },
    { selector: "node.active", style: { "border-width": 3.5, "border-color": t("--fg") } },
    { selector: "node.path", style: { "border-width": 2.5, "border-style": "dashed", "border-color": t("--fg-2") } },
    { selector: "edge.path", style: { width: 4 } },
    { selector: ".dim", style: { opacity: 0.22 } },
  ];
}

/** Left-to-right tidy tree: leaves stack top to bottom, parents centre on their children. */
function layout(ix: ArgIndex) {
  const pos = new Map<string, { x: number; y: number }>();
  let row = 0;
  const place = (id: string, depth: number): number => {
    const kids = ix.kids.get(id) ?? [];
    const y = kids.length
      ? (() => {
          const ys = kids.map((k) => place(k, depth + 1));
          return (Math.min(...ys) + Math.max(...ys)) / 2;
        })()
      : row++ * (NODE_H + GAP_Y);
    pos.set(id, { x: depth * (NODE_W + GAP_X), y });
    return y;
  };
  place(ix.mainId, 0);
  for (const id of ix.orphans) {
    if (!pos.has(id)) {
      row++;
      place(id, 0);
    }
  }
  return pos;
}

const snippet = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

export function ArgumentGraph() {
  const { ix, active, hover, filter, related, pathSet, select, setHover } = useSelection();
  const host = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const handlers = useRef({ select, setHover });
  handlers.current = { select, setHover };

  // Build once per analysis.
  useEffect(() => {
    const el = host.current!;
    const pos = layout(ix);
    const g = cytoscape({
      container: el,
      elements: [
        ...ix.resp.components.map((c) => {
          const rel = ix.parent.get(c.id);
          const head = `${c.id} · ${ix.label(c.id)}${rel ? (rel.type === "support" ? " · supports" : " · attacks") : ""}`;
          return {
            group: "nodes" as const,
            data: { id: c.id, role: ix.role(c.id), low: ix.low(c.id), label: `${head}\n${snippet(c.text, c.id === ix.mainId ? 74 : 66)}` },
            position: pos.get(c.id),
          };
        }),
        ...ix.resp.relations
          .filter((r) => ix.comps.has(r.source) && ix.comps.has(r.target))
          .map((r) => ({ group: "edges" as const, data: { id: "e_" + r.id, source: r.source, target: r.target, rel: r.type } })),
      ],
      style: graphStyle(el),
      layout: { name: "preset" },
      minZoom: 0.25,
      maxZoom: 2.2,
      boxSelectionEnabled: false,
      autoungrabify: true,
      autounselectify: true,
    });
    // Fit if that stays readable; otherwise start at a readable zoom with the
    // main claim pinned to the left edge, vertically centred.
    g.fit(undefined, 24);
    if (g.zoom() < 0.55) {
      g.zoom(0.55);
      const p = g.getElementById(ix.mainId).renderedPosition();
      g.panBy({ x: 24 + (NODE_W * 0.55) / 2 - p.x, y: g.height() / 2 - p.y });
    }
    g.on("tap", "node", (e) => handlers.current.select(e.target.id(), "graph"));
    g.on("tap", (e) => {
      if (e.target === g) handlers.current.select(null, "graph");
    });
    g.on("mouseover", "node", (e) => {
      handlers.current.setHover(e.target.id());
      el.style.cursor = "pointer";
    });
    g.on("mouseout", "node", () => {
      handlers.current.setHover(null);
      el.style.cursor = "";
    });

    // Re-colour when the theme flips.
    const restyle = () => g.style(graphStyle(el));
    const mo = new MutationObserver(restyle);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", restyle);
    const ro = new ResizeObserver(() => g.resize());
    ro.observe(el);

    cy.current = g;
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", restyle);
      ro.disconnect();
      g.destroy();
      cy.current = null;
    };
  }, [ix]);

  // Mirror the shared selection state onto the graph.
  useEffect(() => {
    const g = cy.current;
    if (!g) return;
    g.batch(() => {
      g.elements().removeClass("active path dim hover");
      if (filter !== "all") {
        g.nodes().forEach((n) => {
          const r = n.data("role");
          if (r !== "main" && r !== filter) n.addClass("dim");
        });
        g.edges().forEach((e) => {
          if (e.data("rel") !== filter) e.addClass("dim");
        });
      }
      if (active) {
        const keep = new Set([active, ...related, ...pathSet]);
        g.nodes().forEach((n) => {
          if (!keep.has(n.id())) n.addClass("dim");
          else if (pathSet.has(n.id())) n.addClass("path");
        });
        g.edges().forEach((e) => {
          const s = e.data("source");
          const t = e.data("target");
          if ((s === active || pathSet.has(s)) && pathSet.has(t)) e.addClass("path");
          else if (!(keep.has(s) && keep.has(t))) e.addClass("dim");
        });
        g.getElementById(active).addClass("active");
      }
      if (hover) g.getElementById(hover).addClass("hover");
    });
  }, [active, hover, filter, related, pathSet]);

  const zoom = (k: number) => {
    const g = cy.current;
    if (g) g.zoom({ level: Math.min(2.2, Math.max(0.25, g.zoom() * k)), renderedPosition: { x: g.width() / 2, y: g.height() / 2 } });
  };

  return (
    <div className="flex flex-col gap-2 animate-rise">
      <div className="relative h-[min(68vh,620px)] overflow-hidden rounded-xl border border-line bg-bg [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:18px_18px]">
        {/* Cytoscape forces position:relative on its container, so size it explicitly. */}
        <div ref={host} className="h-full w-full" aria-label="Argument graph" />
        <div className="absolute top-2 right-2 flex gap-1 rounded-lg border border-line bg-surface/90 p-0.5 backdrop-blur">
          <IconButton label="Zoom in" className="size-7" onClick={() => zoom(1.25)}>
            <Plus className="size-3.5" />
          </IconButton>
          <IconButton label="Zoom out" className="size-7" onClick={() => zoom(0.8)}>
            <Minus className="size-3.5" />
          </IconButton>
          <IconButton label="Fit graph" className="size-7" onClick={() => cy.current?.fit(undefined, 24)}>
            <Maximize2 className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <i className="w-5 border-t-2 border-support" /> supports
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="w-5 border-t-2 border-dashed border-attack" /> attacks
        </span>
        <span>Arrows point at what is being argued about. Drag to pan, scroll to zoom.</span>
      </p>
    </div>
  );
}
