import * as React from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-card border border-gray-200 bg-white shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Button ────────────────────────────────────────────────────────────────
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-40";
  const variants: Record<string, string> = {
    primary:
      "bg-brand text-brand-fg shadow-sm hover:bg-brand-hover hover:shadow-accent active:bg-brand-press active:shadow-sm",
    secondary:
      "border border-gray-300 bg-white text-ink hover:border-ink",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
    danger: "bg-danger text-white hover:opacity-90",
  };
  return (
    <button className={cx(base, variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink",
        "placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30",
        className
      )}
      {...rest}
    />
  );
});

// ── Textarea ──────────────────────────────────────────────────────────────
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx(
        "w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-ink",
        "placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30",
        className
      )}
      {...rest}
    />
  );
});

// ── Badge ─────────────────────────────────────────────────────────────────
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const tones: Record<Tone, string> = {
    neutral: "bg-gray-100 text-gray-600",
    success: "bg-success-soft text-success-deep",
    warning: "bg-warning-soft text-warning-deep",
    danger: "bg-danger-soft text-danger-deep",
    info: "bg-info-soft text-info-deep",
    brand: "bg-brand-soft text-brand",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────
export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "success" | "danger";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-info/30 bg-info-soft text-info-deep",
    warning: "border-warning/40 bg-warning-soft text-warning-deep",
    success: "border-success/30 bg-success-soft text-success-deep",
    danger: "border-danger/30 bg-danger-soft text-danger-deep",
  };
  return (
    <div
      className={cx(
        "rounded-card border px-4 py-3 text-sm font-medium",
        tones[tone]
      )}
    >
      {children}
    </div>
  );
}
