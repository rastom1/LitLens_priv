import { useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Copy } from "lucide-react";
import { useSelection } from "../../state/selection";
import { Mono, cn } from "../ui/primitives";

/** Searches the reader can run to check the article's claims independently. */
export function FactCheck() {
  const { ix } = useSelection();
  const qs = ix.resp.suggested_queries;
  if (!qs.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-[13px] font-semibold tracking-tight text-fg">Check it yourself</h3>
      <ul className="flex flex-col">
        {qs.map((q) => (
          <li key={q}>
            <a
              href={`https://duckduckgo.com/?q=${encodeURIComponent(q)}`}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
            >
              <ArrowUpRight className="size-3.5 shrink-0 text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-link" />
              {q}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Model/run metadata and the raw response, for the team. */
export function RunDetails() {
  const { ix } = useSelection();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const r = ix.resp;
  const json = JSON.stringify(r, null, 2);

  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md py-1 text-left text-[12px] text-fg-3 transition-colors hover:text-fg-2 cursor-pointer"
      >
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
        Run details
        <Mono className="ml-auto">
          {r.model.name} {r.model.version} · {(r.latency_ms / 1000).toFixed(1)}s
        </Mono>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 animate-rise">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] text-fg-3">
            <dt>request</dt>
            <dd className="text-fg-2">{r.request_id}</dd>
            <dt>schema</dt>
            <dd className="text-fg-2">{r.schema_version}</dd>
            <dt>heads</dt>
            <dd className="text-fg-2">
              {r.model.component_head} · {r.model.relation_head}
            </dd>
            <dt>source</dt>
            <dd className="text-fg-2">{r.article.license ?? (r.article.is_mock ? "Fictional sample article" : r.article.source)}</dd>
          </dl>
          <div className="relative">
            <button
              type="button"
              onClick={copy}
              className="absolute top-2 right-2 inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px] text-fg-2 hover:text-fg cursor-pointer"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-[10.5px] leading-relaxed text-fg-2">{json}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
