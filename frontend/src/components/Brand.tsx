import { Mono } from "./ui/primitives";

/** A lens with a highlighter stroke through it. */
export function LensMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <clipPath id="ll-lens">
          <circle cx="10.5" cy="10.5" r="7" />
        </clipPath>
      </defs>
      <rect x="2" y="8" width="17" height="6" fill="var(--claim)" clipPath="url(#ll-lens)" />
      <circle cx="10.5" cy="10.5" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M15.6 15.6 21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ tag }: { tag?: string }) {
  return (
    <span className="flex items-center gap-2 text-fg">
      <LensMark />
      <span className="font-display text-[16px] font-semibold tracking-tight">LitLens</span>
      {tag && <Mono className="rounded border border-line px-1.5 py-0.5 text-fg-3">{tag}</Mono>}
    </span>
  );
}
