// Shape of the /analyze response (schema 1.0). The backend in ../server
// returns exactly this; the real model must keep returning it.

export type ComponentType = "claim" | "premise";
export type RelationType = "support" | "attack";

export interface ArgComponent {
  id: string;
  type: ComponentType;
  /** Character offsets into article.text. */
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface ArgRelation {
  id: string;
  /** The component doing the supporting/attacking. */
  source: string;
  /** The component being supported/attacked: the main claim or another component. */
  target: string;
  type: RelationType;
  confidence: number;
}

export interface ApiWarning {
  code: string;
  message: string;
  ids?: string[];
}

export interface Article {
  url: string;
  title: string;
  source: string;
  author: string;
  published_at: string;
  section: string;
  is_mock: boolean;
  word_count: number;
  truncated: boolean;
  /** Paragraphs separated by "\n\n". */
  text: string;
  origin?: string;
  license?: string;
}

export interface AnalysisResponse {
  schema_version: string;
  request_id: string;
  status: "complete" | "partial";
  model: { name: string; version: string; component_head: string; relation_head: string };
  latency_ms: number;
  warnings: ApiWarning[];
  article: Article;
  main_claim_id: string;
  components: ArgComponent[];
  relations: ArgRelation[];
  suggested_queries: string[];
}

export interface AnalyzeRequest {
  url?: string;
  title?: string;
  text?: string;
  source_label?: string;
}

export interface Sample {
  url: string;
  title: string;
  source: string;
  section: string;
  is_mock: boolean;
}

/** How a component relates to its parent; "main" for the main claim, "none" when unlinked. */
export type Role = "main" | RelationType | "none";
/** Net effect on the main claim once attacks-on-attacks are counted. */
export type Stance = "main" | "backs" | "against" | "unlinked";
