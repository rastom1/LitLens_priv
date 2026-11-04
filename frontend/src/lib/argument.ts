import type { AnalysisResponse, ArgComponent, ArgRelation, Role, Stance } from "./types";

/** Components or relations scoring below this are flagged as low confidence. */
export const LOW = 0.6;

export interface ArgIndex {
  resp: AnalysisResponse;
  mainId: string;
  comps: Map<string, ArgComponent>;
  /** The relation leaving each component (to its parent). */
  parent: Map<string, ArgRelation>;
  /** Children of each component, in reading order. */
  kids: Map<string, string[]>;
  /** Components not connected to the main claim. */
  orphans: string[];
  /** Main claim first, then everything else in reading order. */
  order: string[];
  role(id: string): Role;
  low(id: string): boolean;
  label(id: string): string;
  /** The component, then each ancestor up to the root. */
  path(id: string): string[];
  stance(id: string): Stance;
  counts: { support: number; attack: number; backs: number; against: number; low: number };
}

/** API offsets count Unicode code points (Python); JS strings index UTF-16 units. */
function toUtf16(text: string, comps: ArgComponent[]) {
  if (!/[\uD800-\uDBFF]/.test(text)) return comps;
  const at: number[] = [];
  let u = 0;
  for (const ch of text) {
    at.push(u);
    u += ch.length;
  }
  at.push(u);
  return comps.map((c) => ({ ...c, start: at[c.start] ?? c.start, end: at[c.end] ?? c.end }));
}

export function buildIndex(resp: AnalysisResponse): ArgIndex {
  const mainId = resp.main_claim_id;
  const comps = new Map(toUtf16(resp.article.text, resp.components).map((c) => [c.id, c]));
  const parent = new Map<string, ArgRelation>();
  const kids = new Map<string, string[]>();
  for (const r of resp.relations) {
    if (!comps.has(r.source) || !comps.has(r.target)) continue;
    parent.set(r.source, r);
    kids.set(r.target, [...(kids.get(r.target) ?? []), r.source]);
  }
  for (const list of kids.values()) list.sort((a, b) => comps.get(a)!.start - comps.get(b)!.start);

  const path = (id: string) => {
    const out = [id];
    let cur = id;
    for (let guard = 0; parent.has(cur) && guard < 50; guard++) {
      cur = parent.get(cur)!.target;
      if (out.includes(cur)) break;
      out.push(cur);
    }
    return out;
  };

  const stance = (id: string): Stance => {
    if (id === mainId) return "main";
    const p = path(id);
    if (p[p.length - 1] !== mainId) return "unlinked";
    const flips = p.slice(0, -1).filter((x) => parent.get(x)?.type === "attack").length;
    return flips % 2 ? "against" : "backs";
  };

  const role = (id: string): Role => (id === mainId ? "main" : (parent.get(id)?.type ?? "none"));
  const low = (id: string) => (comps.get(id)?.confidence ?? 1) < LOW || (parent.get(id)?.confidence ?? 1) < LOW;

  const label = (id: string) => {
    if (id === mainId) return "Main claim";
    if (comps.get(id)?.type === "claim") return "Claim";
    const p = parent.get(id);
    return p && comps.get(p.target)?.type === "premise" ? "Sub-premise" : "Premise";
  };

  const reading = [...comps.values()].sort((a, b) => a.start - b.start).map((c) => c.id);
  const orphans = reading.filter((id) => stance(id) === "unlinked");

  const counts = { support: 0, attack: 0, backs: 0, against: 0, low: 0 };
  for (const r of parent.values()) counts[r.type]++;
  for (const id of reading) {
    const s = stance(id);
    if (s === "backs" || s === "against") counts[s]++;
    if (low(id)) counts.low++;
  }

  return {
    resp,
    mainId,
    comps,
    parent,
    kids,
    orphans,
    order: [mainId, ...reading.filter((id) => id !== mainId)],
    role,
    low,
    label,
    path,
    stance,
    counts,
  };
}

/** Article paragraphs with their character ranges in article.text. */
export function paragraphs(text: string) {
  const out: { start: number; end: number }[] = [];
  let off = 0;
  for (const p of text.split("\n\n")) {
    out.push({ start: off, end: off + p.length });
    off += p.length + 2;
  }
  return out;
}

export const relWord = { support: "Supports", attack: "Attacks" } as const;
