import { cn } from "@/lib/utils";
import { statusConfig, type LeadStatus } from "@/lib/mock-data";

interface StatusBadgeProps {
  status: LeadStatus;
  size?: "sm" | "default";
}

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium border",
        size === "sm"
          ? "text-[10px] px-1.5 py-0.5"
          : "text-[11px] px-2 py-0.5",
        config.bg,
        config.color,
        config.border
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
