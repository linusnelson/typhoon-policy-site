import Image from "next/image";

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/brand/typhoon-emblem.png"
        alt="Typhoon Electronic Solutions"
        width={36}
        height={36}
        priority
        className="h-9 w-9 object-contain"
      />
      <div className="leading-tight">
        <div className="font-display text-lg font-bold tracking-tight text-ink">
          Typhoon Policies
        </div>
        {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      </div>
    </div>
  );
}
