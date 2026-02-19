"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime, formatDate } from "@/lib/mock-data";
import { getRandomGif } from "@/lib/sales-gifs";
import {
  getHarvestRuns,
  getHarvestSummary,
  getProfiles,
  triggerHarvest,
  type ApiHarvestRun,
  type ApiHarvestSummary,
  type ApiProfile,
} from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

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
  pending: {
    label: "Pending",
    emoji: "\u23F3",
    color: "text-foreground-muted",
    bg: "bg-sand-100",
    dot: "bg-sand-300",
  },
} as const;

function getDuration(run: ApiHarvestRun): string {
  if (!run.completed_at || !run.started_at) return "In progress...";
  const start = new Date(run.started_at).getTime();
  const end = new Date(run.completed_at).getTime();
  const diffMs = Math.max(0, end - start);
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export default function HarvestMonitorPage() {
  const [runs, setRuns] = useState<ApiHarvestRun[]>([]);
  const [summary, setSummary] = useState<ApiHarvestSummary | null>(null);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [runsRes, summaryRes, profilesRes] = await Promise.all([
        getHarvestRuns(),
        getHarvestSummary(undefined, 15),
        getProfiles(),
      ]);
      setRuns(runsRes);
      setSummary(summaryRes);
      setProfiles(profilesRes);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load harvest runs"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  const lastCompletedRun = runs.find((r) => r.status === "completed");

  const profileNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const profile of profiles) {
      map.set(profile.id, profile.name);
    }
    return map;
  }, [profiles]);

  const sourceStats = useMemo(() => {
    const acc: Record<string, { totalResults: number; errors: number; lastStatus: string }> = {};
    for (const run of runs) {
      const source = run.source;
      if (!acc[source]) {
        acc[source] = { totalResults: 0, errors: 0, lastStatus: run.status };
      }
      acc[source].totalResults += run.vacancies_found;
      if (run.status !== "completed") acc[source].errors += 1;
      if (run.id === runs[0]?.id) acc[source].lastStatus = run.status;
    }
    return acc;
  }, [runs]);

  async function handleTriggerHarvest() {
    const targetId = selectedProfileId ?? profiles[0]?.id;
    if (!targetId) return;
    setTriggering(true);
    try {
      await triggerHarvest(targetId);
      await load();
    } catch (err) {
      setError(toErrorMessage(err, "Failed to trigger harvest"));
    } finally {
      setTriggering(false);
    }
  }

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
            <button
              onClick={load}
              className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active"
            >
              {"\uD83D\uDD04"} Refresh
            </button>
            {profiles.length > 1 && (
              <select
                value={selectedProfileId ?? ""}
                onChange={(e) => setSelectedProfileId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-border bg-background-card px-3 py-2 text-[13px] text-foreground transition-colors focus:border-accent focus:outline-none"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleTriggerHarvest}
              disabled={triggering || profiles.length === 0}
              className={cn(
                "flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]",
                (triggering || profiles.length === 0) && "cursor-not-allowed opacity-70"
              )}
            >
              {triggering ? "Triggering..." : "\u25B6\uFE0F Trigger Harvest"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

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
                ? formatRelativeTime(lastCompletedRun.completed_at || "")
                : "Never"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-foreground-muted">
            {lastCompletedRun
              ? `${profileNameById.get(lastCompletedRun.profile_id) ?? "Profile"} — ${lastCompletedRun.vacancies_new} new vacancies`
              : "No runs yet"}
          </p>
        </div>

        {/* Summary */}
        <div className="rounded-lg border border-border bg-background-card px-5 py-4 transition-colors hover:border-border-strong">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\u23F1\uFE0F"} Recent Summary
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {summary?.summary.total_runs ?? 0} runs
            </span>
          </div>
          <p className="mt-1 text-[12px] text-foreground-muted">
            {summary
              ? `${summary.summary.total_vacancies_new} new vacancies across ${summary.summary.completed} completed runs`
              : "No summary data"}
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
              {Object.keys(sourceStats).length || 0} sources
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {Object.entries(sourceStats).map(([name, stats]) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    stats.errors > 0 ? "bg-warning" : "bg-success"
                  )}
                />
                <span className="text-[11px] text-foreground-muted">{name}</span>
              </div>
            ))}
            {Object.keys(sourceStats).length === 0 && (
              <span className="text-[11px] text-foreground-muted">
                No sources yet
              </span>
            )}
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
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Source</th>
                  <th className="w-10 px-5 py-2.5"><span className="sr-only">Expand</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-5 py-4 text-[13px] text-foreground-muted" colSpan={8}>
                      Loading harvest runs...
                    </td>
                  </tr>
                ) : runs.length === 0 ? (
                  <tr>
                    <td className="px-5 py-4 text-[13px] text-foreground-muted" colSpan={8}>
                      No harvest runs yet.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => {
                    const statusCfg =
                      harvestStatusConfig[
                        run.status as keyof typeof harvestStatusConfig
                      ] ?? harvestStatusConfig.pending;
                    const isExpanded = expandedRows.has(run.id);

                    return (
                      <Fragment key={run.id}>
                        <tr className="border-b border-border-subtle">
                          <td className="px-5 py-3 text-[13px] font-medium text-foreground">
                            {profileNameById.get(run.profile_id) ?? `Profile ${run.profile_id}`}
                          </td>
                          <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                            {run.started_at ? formatDate(run.started_at) : "--"}
                          </td>
                          <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                            {getDuration(run)}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                statusCfg.bg,
                                statusCfg.color
                              )}
                            >
                              {statusCfg.emoji} {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                            {run.vacancies_found}
                          </td>
                          <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                            {run.vacancies_new}
                          </td>
                          <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                            {run.source}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              className="flex items-center gap-1 text-[11px] font-medium text-foreground-muted hover:text-foreground"
                              onClick={() => toggleRow(run.id)}
                            >
                              Details
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 transition-transform",
                                  isExpanded && "rotate-180"
                                )}
                              />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-border-subtle bg-background-sunken">
                            <td colSpan={8} className="px-5 py-4 text-[12px] text-foreground-muted">
                              <div className="flex items-center justify-between">
                                <span>
                                  Started: {run.started_at ? formatDate(run.started_at) : "--"}
                                </span>
                                <span>
                                  Completed: {run.completed_at ? formatDate(run.completed_at) : "--"}
                                </span>
                              </div>
                              {run.error_message && (
                                <p className="mt-2 text-danger">Error: {run.error_message}</p>
                              )}
                              {!run.error_message && (
                                <p className="mt-2">No source breakdown available yet.</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* -- Footer --------------------------------------- */}
      <footer className="border-t border-border py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getRandomGif("motivation")}
              alt="Harvest motivation"
              className="hidden h-16 w-24 rounded-lg object-cover sm:block"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div>
              <p className="text-[13px] font-medium text-foreground-secondary">
                Keep the pipeline moving.
              </p>
              <p className="text-[11px] text-foreground-faint">
                Monitor runs and catch failures early.
              </p>
            </div>
          </div>
          <span className="text-[11px] text-foreground-faint">
            Signal Engine v0.1
          </span>
        </div>
      </footer>
    </div>
  );
}
