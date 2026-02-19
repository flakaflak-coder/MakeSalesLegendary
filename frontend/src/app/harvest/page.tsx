"use client";

import { Fragment, useState } from "react";
import {
  Play,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mockHarvestRuns,
  formatRelativeTime,
  formatDate,
  type HarvestRun,
} from "@/lib/mock-data";
import { getRandomGif } from "@/lib/sales-gifs";

/* -- Status config for harvest runs ---------------------- */

const harvestStatusConfig = {
  completed: {
    label: "Completed",
    emoji: "\u2705",
    color: "text-success",
    bg: "bg-success/10",
    dot: "bg-success",
  },
  partial: {
    label: "Partial",
    emoji: "\u26A0\uFE0F",
    color: "text-warning",
    bg: "bg-warning/10",
    dot: "bg-warning",
  },
  failed: {
    label: "Failed",
    emoji: "\u274C",
    color: "text-danger",
    bg: "bg-danger/10",
    dot: "bg-danger",
  },
  running: {
    label: "Running",
    emoji: "\uD83D\uDD04",
    color: "text-accent",
    bg: "bg-accent/10",
    dot: "bg-accent",
  },
} as const;

/* -- Helpers --------------------------------------------- */

function getDuration(run: HarvestRun): string {
  if (!run.completedAt) return "In progress...";
  const start = new Date(run.startedAt).getTime();
  const end = new Date(run.completedAt).getTime();
  const diffMs = end - start;
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function getSourceStatusEmoji(status: "ok" | "error" | "skipped") {
  switch (status) {
    case "ok":
      return "\u2705";
    case "error":
      return "\u26A0\uFE0F";
    case "skipped":
      return "\u23ED\uFE0F";
  }
}

/* -- Page ------------------------------------------------ */

export default function HarvestMonitorPage() {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const lastCompletedRun = mockHarvestRuns.find(
    (r) => r.status === "completed"
  );

  // Aggregate source stats across all runs
  const sourceStats = mockHarvestRuns.reduce(
    (acc, run) => {
      for (const source of run.sources) {
        if (!acc[source.name]) {
          acc[source.name] = { totalResults: 0, lastStatus: source.status, errors: 0 };
        }
        acc[source.name].totalResults += source.count;
        if (source.status === "error") {
          acc[source.name].errors += 1;
        }
        // Use most recent run's status for "current" status
        if (run.id === mockHarvestRuns[0].id) {
          acc[source.name].lastStatus = source.status;
        }
      }
      return acc;
    },
    {} as Record<string, { totalResults: number; lastStatus: string; errors: number }>
  );

  return (
    <div className="px-6 py-6">
      {/* -- Header ---------------------------------------- */}
      <section className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
              {"\uD83D\uDE9C"} Harvest Monitor
            </h1>
            <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
              Watch the Signal Engine scrape, enrich, and surface leads.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active">
              {"\uD83D\uDD04"} Refresh
            </button>
            <button className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]">
              {"\u25B6\uFE0F"} Trigger Harvest
            </button>
          </div>
        </div>
      </section>

      {/* -- Status Overview Cards ------------------------- */}
      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Last Run */}
        <div className="rounded-lg border border-border bg-background-card px-5 py-4 transition-colors hover:border-border-strong">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\u23F0"} Last Run
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {lastCompletedRun
                ? formatRelativeTime(lastCompletedRun.completedAt!)
                : "Never"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-foreground-muted">
            {lastCompletedRun
              ? `${lastCompletedRun.profileName} \u2014 ${lastCompletedRun.stats.newVacancies} new vacancies`
              : "No runs yet"}
          </p>
        </div>

        {/* Next Scheduled */}
        <div className="rounded-lg border border-border bg-background-card px-5 py-4 transition-colors hover:border-border-strong">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\u23F1\uFE0F"} Next Scheduled
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              In 4 hours
            </span>
          </div>
          <p className="mt-1 text-[12px] text-foreground-muted">
            Feb 19, 2026 at 18:00 &mdash; Accounts Payable
          </p>
        </div>

        {/* Sources Active */}
        <div className="rounded-lg border border-border bg-background-card px-5 py-4 transition-colors hover:border-border-strong">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\uD83D\uDCE1"} Sources Active
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              2 of 2 healthy
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              <span className="text-[11px] text-foreground-muted">SerpAPI</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "h-2 w-2 rounded-full",
                sourceStats["Indeed.nl"]?.errors > 0 ? "bg-warning" : "bg-success"
              )} />
              <span className="text-[11px] text-foreground-muted">Indeed.nl</span>
            </div>
          </div>
        </div>
      </section>

      {/* -- Harvest Runs Table ---------------------------- */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83D\uDCCB"} Harvest Runs
        </h2>

        <div className="overflow-hidden rounded-lg border border-border bg-background-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Profile</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Started</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Duration</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Status</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Vacancies</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">New</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Companies</th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Errors</th>
                  <th className="w-10 px-5 py-2.5"><span className="sr-only">Expand</span></th>
                </tr>
              </thead>
              <tbody>
                {mockHarvestRuns.map((run) => {
                  const statusCfg = harvestStatusConfig[run.status];
                  const isExpanded = expandedRows.has(run.id);

                  return (
                    <Fragment key={run.id}>
                      <tr
                        className={cn(
                          "border-b border-border-subtle transition-colors hover:bg-background-hover cursor-pointer",
                          isExpanded && "bg-background-sunken"
                        )}
                        onClick={() => toggleRow(run.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRow(run.id);
                          }
                        }}
                      >
                        {/* Profile */}
                        <td className="px-5 py-3">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium text-foreground">
                              {run.profileName}
                            </span>
                            <span className="text-[11px] text-foreground-muted">
                              {run.profileSlug}
                            </span>
                          </div>
                        </td>

                        {/* Started */}
                        <td className="px-5 py-3 text-[12px] text-foreground-secondary whitespace-nowrap">
                          {formatRelativeTime(run.startedAt)}
                        </td>

                        {/* Duration */}
                        <td className="px-5 py-3 text-[12px] font-mono tabular-nums text-foreground-secondary whitespace-nowrap">
                          {getDuration(run)}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <span
                            className={cn(
                              "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                              statusCfg.bg,
                              statusCfg.color
                            )}
                          >
                            {run.status === "running" ? (
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                              </span>
                            ) : (
                              <span>{statusCfg.emoji}</span>
                            )}
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Vacancies Found */}
                        <td className="px-5 py-3 text-[13px] tabular-nums text-foreground-secondary">
                          {run.stats.vacanciesFound}
                        </td>

                        {/* New */}
                        <td className="px-5 py-3 text-[13px] font-medium tabular-nums text-accent">
                          +{run.stats.newVacancies}
                        </td>

                        {/* Companies */}
                        <td className="px-5 py-3 text-[13px] tabular-nums text-foreground-secondary">
                          {run.stats.companiesMatched}
                        </td>

                        {/* Errors */}
                        <td
                          className={cn(
                            "px-5 py-3 text-[13px] tabular-nums",
                            run.stats.errors > 0
                              ? "font-medium text-danger"
                              : "text-foreground-muted"
                          )}
                        >
                          {run.stats.errors}
                        </td>

                        {/* Expand chevron */}
                        <td className="px-5 py-3">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-foreground-faint transition-transform duration-200",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="px-5 py-4 bg-background-sunken border-b border-border-subtle">
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                              {/* Source breakdown */}
                              <div>
                                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                                  Source Breakdown
                                </h4>
                                <div className="space-y-2">
                                  {run.sources.map((source) => (
                                    <div
                                      key={source.name}
                                      className="flex items-center justify-between rounded-md border border-border-subtle bg-background-card px-3 py-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>{getSourceStatusEmoji(source.status)}</span>
                                        <span className="text-[13px] text-foreground-secondary">
                                          {source.name}
                                        </span>
                                      </div>
                                      <span className="text-[13px] font-medium tabular-nums text-foreground">
                                        {source.count} results
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Summary stats */}
                              <div>
                                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                                  Run Summary
                                </h4>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between rounded-md border border-border-subtle bg-background-card px-3 py-2">
                                    <span className="text-[13px] text-foreground-secondary">
                                      New vacancies
                                    </span>
                                    <span className="text-[13px] font-medium tabular-nums text-accent">
                                      +{run.stats.newVacancies}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between rounded-md border border-border-subtle bg-background-card px-3 py-2">
                                    <span className="text-[13px] text-foreground-secondary">
                                      New companies
                                    </span>
                                    <span className="text-[13px] font-medium tabular-nums text-accent">
                                      +{run.stats.newCompanies}
                                    </span>
                                  </div>
                                  {run.stats.errors > 0 && (
                                    <div className="flex items-center justify-between rounded-md border border-danger/20 bg-danger/5 px-3 py-2">
                                      <span className="text-[13px] text-danger">
                                        Errors encountered
                                      </span>
                                      <span className="text-[13px] font-medium tabular-nums text-danger">
                                        {run.stats.errors}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between rounded-md border border-border-subtle bg-background-card px-3 py-2">
                                    <span className="text-[13px] text-foreground-secondary">
                                      Started
                                    </span>
                                    <span className="text-[12px] font-mono text-foreground-muted">
                                      {formatDate(run.startedAt)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* -- Source Health ---------------------------------- */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83D\uDCE1"} Source Health
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Google Jobs (SerpAPI) */}
          <div className="rounded-lg border border-border bg-background-card px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-success/10 text-base">
                  {"\u2705"}
                </span>
                <div>
                  <span className="text-[13px] font-medium text-foreground">
                    Google Jobs (SerpAPI)
                  </span>
                  <p className="text-[11px] text-foreground-muted">
                    Primary source
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                {"\u2705"} Healthy
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Last Response
                </span>
                <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                  {formatRelativeTime(mockHarvestRuns[0].startedAt)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Total Results
                </span>
                <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                  {sourceStats["Google Jobs (SerpAPI)"]?.totalResults ?? 0}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Error Rate
                </span>
                <p className="mt-0.5 text-[13px] font-medium text-success">
                  0%
                </p>
              </div>
            </div>
          </div>

          {/* Indeed.nl */}
          <div className="rounded-lg border border-border bg-background-card px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10 text-base">
                  {"\u26A0\uFE0F"}
                </span>
                <div>
                  <span className="text-[13px] font-medium text-foreground">
                    Indeed.nl
                  </span>
                  <p className="text-[11px] text-foreground-muted">
                    Secondary source
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                {"\u26A0\uFE0F"} Intermittent Errors
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Last Response
                </span>
                <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                  {formatRelativeTime(mockHarvestRuns[0].startedAt)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Total Results
                </span>
                <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                  {sourceStats["Indeed.nl"]?.totalResults ?? 0}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Error Rate
                </span>
                <p className="mt-0.5 text-[13px] font-medium text-warning">
                  {sourceStats["Indeed.nl"]
                    ? `${Math.round(
                        (sourceStats["Indeed.nl"].errors /
                          mockHarvestRuns.length) *
                          100
                      )}%`
                    : "0%"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- Footer GIF ------------------------------------ */}
      <footer className="border-t border-border pt-6">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="relative mx-auto mb-3 overflow-hidden rounded-lg border border-border-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getRandomGif("hustle")}
                alt="The engine never sleeps"
                className="h-28 w-48 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sand-900/80 to-transparent px-3 py-2">
                <span className="text-[11px] font-semibold text-white">
                  The engine never sleeps. {"\uD83D\uDE9C"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
