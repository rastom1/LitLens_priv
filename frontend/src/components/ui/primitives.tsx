import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LOW } from "../../lib/argument";

export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-claim text-on-claim font-semibold hover:brightness-105 active:brightness-95 shadow-[0_0_0_1px_oklch(0_0_0/0.15),0_8px_24px_-10px_var(--claim)]",
  secondary: "bg-elevated text-fg border border-line hover:bg-hover hover:border-line-strong",
  ghost: "text-fg-2 hover:text-fg hover:bg-hover",
};

export function Button({
  variant = "secondary",
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] whitespace-nowrap transition-[background,border-color,transform,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-md text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg active:scale-95 cursor-pointer",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange(v: T): void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors duration-150 cursor-pointer",
            value === o.value ? "bg-elevated text-fg shadow-[0_1px_0_oklch(1_0_0/0.06)_inset,0_1px_2px_oklch(0_0_0/0.3)]" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Small mono label for metadata: ids, codes, statuses. */
export function Mono({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("font-mono text-[11px] tracking-tight tabular-nums", className)}>{children}</span>;
}

/** Five-segment meter; segments below LOW render in the caution colour. */
export function Confidence({ value }: { value: number }) {
  const filled = Math.round(value * 5);
  const low = value < LOW;
  return (
    <span className="inline-flex items-center gap-1.5" title={`Model confidence ${value.toFixed(2)}`}>
      <span className="flex gap-[2px]" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={cn("h-2.5 w-[3px] rounded-[1px]", i < filled ? (low ? "bg-caution" : "bg-fg-2") : "bg-line")} />
        ))}
      </span>
      <Mono className={low ? "text-caution" : "text-fg-3"}>{value.toFixed(2)}</Mono>
    </span>
  );
}
