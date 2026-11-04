import { describe, expect, it } from "vitest";
import { buildIndex, paragraphs } from "./argument";
import type { AnalysisResponse } from "./types";
import lightRail from "../../../server/fixtures/02-line-3-light-rail.json";
import voa from "../../../server/fixtures/01-voa-cuba.json";

const rail = buildIndex(lightRail as AnalysisResponse);

describe("buildIndex", () => {
  it("labels claims, premises and sub-premises", () => {
    expect(rail.label("C1")).toBe("Main claim");
    expect(rail.label("P2")).toBe("Premise");
    expect(rail.label("P2.1")).toBe("Sub-premise");
    expect(rail.label("C2")).toBe("Claim");
  });

  it("orders children by position in the article", () => {
    expect(rail.kids.get("C1")).toEqual(["P1", "P2", "P3", "P4", "C2"]);
  });

  it("walks the path up to the main claim", () => {
    expect(rail.path("P4.1")).toEqual(["P4.1", "P4", "C1"]);
  });

  it("treats an attack on an attack as backing the main claim", () => {
    expect(rail.role("P3")).toBe("attack");
    expect(rail.stance("P3")).toBe("against");
    expect(rail.stance("P3.1")).toBe("backs");
    expect(rail.stance("P2.1")).toBe("backs");
  });

  it("counts relations, stances and low-confidence parts", () => {
    expect(rail.counts.support + rail.counts.attack).toBe(lightRail.relations.length);
    expect(rail.counts.backs + rail.counts.against).toBe(lightRail.components.length - 1);
    expect(rail.low("P5")).toBe(true);
    expect(rail.orphans).toEqual([]);
  });

  it("puts the main claim first in reveal order even when it comes late in the text", () => {
    const v = buildIndex(voa as AnalysisResponse);
    expect(v.order[0]).toBe("C1");
    expect(v.order).toHaveLength(voa.components.length);
  });

  it("converts code-point offsets to UTF-16 when the text has astral characters", () => {
    const text = "🙂 Cities should build transit. Buses are slow.";
    const resp = {
      ...(lightRail as AnalysisResponse),
      article: { ...lightRail.article, text },
      main_claim_id: "C1",
      // code-point offsets, as the Python backend produces them
      components: [{ id: "C1", type: "claim" as const, start: 2, end: 29, text: "Cities should build transit", confidence: 0.9 }],
      relations: [],
    };
    const c = buildIndex(resp).comps.get("C1")!;
    expect(text.slice(c.start, c.end)).toBe("Cities should build transit");
  });
});

describe("paragraphs", () => {
  it("returns ranges that slice back to each paragraph", () => {
    const t = lightRail.article.text;
    const ps = paragraphs(t);
    expect(ps).toHaveLength(t.split("\n\n").length);
    expect(t.slice(ps[1].start, ps[1].end)).toBe(t.split("\n\n")[1]);
  });
});
