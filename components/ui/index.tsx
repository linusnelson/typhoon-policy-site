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
        "rounded-card border border-gray-200 bg-offwhite",
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
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "bg-amber text-ink hover:bg-amber-hover active:bg-amber-press",
    secondary: "bg-gray-100 text-ink hover:bg-gray-200",
    ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
    danger: "bg-danger text-offwhite hover:opacity-90",
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
        "placeholder:text-gray-400 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/30",
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
        "placeholder:text-gray-400 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/30",
        className
      )}
      {...rest}
    />
  );
});

// ── Badge ─────────────────────────────────────────────────────────────────
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "amber";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const tones: Record<Tone, string> = {
    neutral: "bg-gray-100 text-gray-600",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-[#92400E]",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
    amber: "bg-amber-soft text-amber-press",
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
  tone?: "info" | "warning" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-info/30 bg-info-soft text-[#1E3A8A]",
    warning: "border-warning/40 bg-warning-soft text-[#92400E]",
    success: "border-success/30 bg-success-soft text-[#14532D]",
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
