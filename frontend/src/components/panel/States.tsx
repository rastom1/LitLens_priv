import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Mono, cn } from "../ui/primitives";

const STEPS = ["Reading the article text", "Finding claims and premises", "Linking what supports and attacks what"];

/** Pipeline steps while the API works. Steps advance on a timer; the request decides when it ends. */
export function AnalyzingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = [setTimeout(() => setStep(1), 450), setTimeout(() => setStep(2), 950)];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      <ol className="flex flex-col gap-2.5">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2.5 text-[13px] transition-colors", i < step ? "text-support-ink" : i === step ? "text-fg" : "text-fg-3")}>
            <span
              className={cn(
                "size-2.5 rounded-full border-2 border-current",
                i < step && "bg-current",
                i === step && "animate-pulse",
              )}
            />
            {s}
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="h-28 animate-pulse rounded-xl bg-surface" />
        {[0.92, 0.78, 0.85].map((w, i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] bg-surface" style={{ width: `${w * 100}%`, marginLeft: i ? 22 : 0, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ title, message, code, children }: { title: string; message: string; code?: string; children?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-attack/40 bg-attack/8 p-4 animate-rise">
      <div className="flex items-center gap-2">
        <CircleAlert className="size-4 text-attack-ink" />
        <h3 className="font-display text-[14px] font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="text-[13px] leading-snug text-fg-2">{message}</p>
      {children}
      {code && <Mono className="text-fg-3">{code}</Mono>}
    </div>
  );
}
