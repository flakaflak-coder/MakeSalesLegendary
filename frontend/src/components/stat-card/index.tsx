import { cn } from "@/lib/utils";

interface StatCardProps {
  emoji: string;
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
}

const trendStyles = {
  up: { prefix: "\u2191", color: "text-success" },
  down: { prefix: "\u2193", color: "text-danger" },
  flat: { prefix: "\u2192", color: "text-foreground-muted" },
} as const;

export function StatCard({ emoji, label, value, change, trend = "up" }: StatCardProps) {
  const { prefix, color } = trendStyles[trend];

  return (
    <div className="rounded-lg border border-border bg-background-card px-5 py-4 transition-colors hover:border-border-strong">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
        {emoji} {label}
      </span>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </span>
        {change && (
          <span className={cn("text-[12px] font-medium", color)}>
            {prefix} {change}
          </span>
        )}
      </div>
    </div>
  );
}
