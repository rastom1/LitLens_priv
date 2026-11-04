import type { AnalysisResponse, AnalyzeRequest, Sample } from "./types";

export const API_BASE: string = import.meta.env.VITE_LITLENS_API ?? "http://localhost:8008";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { ...init, headers: { "Content-Type": "application/json" } });
  } catch {
    throw new ApiError("API_UNREACHABLE", `Can't reach the LitLens API at ${API_BASE}. Is the server running?`);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, res.status);
  }
  return body as T;
}

export const analyze = (req: AnalyzeRequest) =>
  call<AnalysisResponse>("/analyze", { method: "POST", body: JSON.stringify(req) });

export const listSamples = () => call<Sample[]>("/samples");
