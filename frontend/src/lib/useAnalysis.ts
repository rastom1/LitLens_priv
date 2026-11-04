import { useCallback, useRef, useState } from "react";
import { analyze, ApiError } from "./api";
import type { AnalysisResponse, AnalyzeRequest } from "./types";

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading"; req: AnalyzeRequest }
  | { status: "done"; req: AnalyzeRequest; resp: AnalysisResponse }
  | { status: "error"; req: AnalyzeRequest; error: ApiError };

/** Runs /analyze; a newer request always wins over an older one still in flight. */
export function useAnalysis({ minMs = 0 } = {}) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const latest = useRef(0);

  const run = useCallback(
    async (req: AnalyzeRequest) => {
      const token = ++latest.current;
      setState({ status: "loading", req });
      const started = performance.now();
      let next: AnalysisState;
      try {
        next = { status: "done", req, resp: await analyze(req) };
      } catch (e) {
        next = { status: "error", req, error: e instanceof ApiError ? e : new ApiError("UNKNOWN", String(e)) };
      }
      // Hold the pipeline animation briefly so fast responses don't flash.
      const wait = minMs - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (token === latest.current) setState(next);
    },
    [minMs],
  );

  return { state, run };
}
