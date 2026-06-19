import Image from "next/image";

export function Brand({
  label = "Typhoon",
  subtitle,
  compact = false,
}: {
  label?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/brand/typhoon-emblem.png"
        alt="Typhoon Electronic Solutions"
        width={36}
        height={36}
        priority
        className="h-9 w-9 shrink-0 object-contain"
      />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-lg font-bold tracking-tight text-ink">
            {label}
          </div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
