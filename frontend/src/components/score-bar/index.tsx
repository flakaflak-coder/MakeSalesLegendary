"use client";

import { cn } from "@/lib/utils";

interface ScoreBarProps {
  score: number;
  size?: "sm" | "md";
  showLabel?: boolean;
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-signal-hot";
  if (score >= 60) return "bg-signal-warm";
  return "bg-signal-monitor";
}

function scoreLabelColor(score: number): string {
  if (score >= 80) return "text-signal-hot";
  if (score >= 60) return "text-signal-warm";
  return "text-signal-monitor";
}

export function ScoreBar({ score, size = "md", showLabel = false }: ScoreBarProps) {
  const clampedScore = Math.max(0, Math.min(100, score));

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex-1 overflow-hidden rounded-full bg-sand-200",
          size === "sm" ? "h-1.5" : "h-2"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            scoreBarColor(clampedScore)
          )}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      {showLabel && (
        <span
          className={cn(
            "tabular-nums font-semibold",
            size === "sm" ? "text-xs" : "text-sm",
            scoreLabelColor(clampedScore)
          )}
        >
          {clampedScore}
        </span>
      )}
    </div>
  );
}
