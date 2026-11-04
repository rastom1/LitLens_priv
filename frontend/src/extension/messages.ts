import type { Role } from "../lib/types";

// Messages between the side panel and the content script in the article tab.

export interface HighlightItem {
  id: string;
  text: string;
  role: Role;
  low: boolean;
  label: string;
}

export interface Extracted {
  url: string;
  title: string;
  paragraphs: string[];
}

export interface HighlightResult {
  placed: string[];
  missing: string[];
}

/** Panel → content script. */
export type ToContent =
  | { type: "litlens:extract" }
  | { type: "litlens:highlight"; items: HighlightItem[] }
  | { type: "litlens:state"; active: string | null; related: string[]; path: string[]; scroll: boolean }
  | { type: "litlens:hover"; id: string | null }
  | { type: "litlens:clear" };

/** Content script → panel. */
export type FromContent = { type: "litlens:select"; id: string } | { type: "litlens:page-hover"; id: string | null };
