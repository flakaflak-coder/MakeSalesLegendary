"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Search, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { salesGifs, getRandomQuote } from "@/lib/sales-gifs";
import {
  getAnalyticsFunnel,
  getAnalyticsScoringAccuracy,
  getAnalyticsTermPerformance,
  getHarvestSummary,
  getProfiles,
  type ApiAnalyticsFunnel,
  type ApiAnalyticsScoringAccuracy,
  type ApiAnalyticsTermPerformance,
  type ApiHarvestSummary,
  type ApiProfile,
} from "@/lib/api";

const funnelColors = [
  "bg-sand-900",
  "bg-sand-700",
  "bg-sand-600",
  "bg-accent",
  "bg-accent-hover",
  "bg-signal-hot",
];

function getIsoWeek(date: Date): { year: number; week: number } {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week };
}

export default function AnalyticsPage() {
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [funnel, setFunnel] = useState<ApiAnalyticsFunnel | null>(null);
  const [scoringAccuracy, setScoringAccuracy] = useState<ApiAnalyticsScoringAccuracy | null>(null);
  const [termPerformance, setTermPerformance] = useState<ApiAnalyticsTermPerformance | null>(null);
  const [harvestSummary, setHarvestSummary] = useState<ApiHarvestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const quote = getRandomQuote();

  useEffect(() => {
    let cancelled = false;

    async function loadProfiles() {
      try {
        const profilesRes = await getProfiles();
        if (cancelled) return;
        setProfiles(profilesRes);
        setSelectedProfileId((prev) => prev ?? profilesRes[0]?.id ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load profiles");
      }
    }

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProfileId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [funnelRes, scoringRes, termRes, harvestRes] = await Promise.all([
          getAnalyticsFunnel(selectedProfileId),
          getAnalyticsScoringAccuracy(selectedProfileId),
          getAnalyticsTermPerformance(selectedProfileId),
          getHarvestSummary(selectedProfileId, 12),
        ]);
        if (cancelled) return;
        setFunnel(funnelRes);
        setScoringAccuracy(scoringRes);
        setTermPerformance(termRes);
        setHarvestSummary(harvestRes);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedProfileId]);

  const funnelMap = useMemo(() => {
    const map = new Map<string, number>();
    funnel?.funnel.forEach((stage) => map.set(stage.stage, stage.count));
    return map;
  }, [funnel]);

  const funnelStages = useMemo(() => {
    const harvested = funnelMap.get("vacancies_harvested") ?? 0;
    const enriched = funnelMap.get("vacancies_enriched") ?? 0;
    const qualified = funnelMap.get("leads_qualified") ?? 0;
    const contacted = funnelMap.get("leads_contacted") ?? 0;
    const converted = funnelMap.get("leads_converted") ?? 0;
    return [
      { key: "harvested", label: "Harvested", value: harvested },
      { key: "enriched", label: "Enriched", value: enriched },
      { key: "qualified", label: "Qualified", value: qualified },
      { key: "contacted", label: "Contacted", value: contacted },
      { key: "meeting", label: "Meeting", value: 0 },
      { key: "converted", label: "Converted", value: converted },
    ] as const;
  }, [funnelMap]);

  const maxFunnel = funnelStages[0]?.value ?? 0;
  const overallConversion = maxFunnel
    ? ((funnelStages[funnelStages.length - 1].value / maxFunnel) * 100).toFixed(1)
    : "0.0";

  const weeklyTotals = useMemo(() => {
    if (!harvestSummary) return [] as Array<{ label: string; total: number }>;
    const buckets = new Map<string, { label: string; total: number }>();
    for (const run of harvestSummary.runs) {
      const dateStr = run.completed_at || run.started_at;
      if (!dateStr) continue;
      const date = new Date(dateStr);
      const { year, week } = getIsoWeek(date);
      const key = `${year}-W${week}`;
      const label = `W${week}`;
      const current = buckets.get(key) ?? { label, total: 0 };
      current.total += run.vacancies_new;
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [harvestSummary]);

  const weeklyMax = Math.max(1, ...weeklyTotals.map((w) => w.total));

  const termRows = useMemo(() => {
    const terms = termPerformance?.terms ?? [];
    const sorted = [...terms].sort((a, b) => b.avg_lead_score - a.avg_lead_score);
    return sorted;
  }, [termPerformance]);

  const maxTermScore = Math.max(1, ...termRows.map((t) => t.avg_lead_score));

  const scoreDistribution = scoringAccuracy?.score_distribution ?? {};
  const distributionEntries = Object.entries(scoreDistribution).sort((a, b) => {
    const parse = (k: string) => Number(k.split("-")[0]);
    return parse(a[0]) - parse(b[0]);
  });
  const distributionMax = Math.max(1, ...distributionEntries.map(([, v]) => v));

  const bestTerm = termRows[0];
  const scoreGap = scoringAccuracy
    ? Math.abs(scoringAccuracy.converted.avg_composite_score - scoringAccuracy.rejected.avg_composite_score)
    : 0;

  return (
    <div className="px-6 py-6">
      {/* ── Page Header ─────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
              {"\uD83D\uDCC8"} Analytics
            </h1>
            <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
              Numbers don&apos;t lie. Here&apos;s how Signal Engine is
              performing.
            </p>
          </div>

          {/* Profile selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              Profile
            </span>
            <select
              value={selectedProfileId ?? ""}
              onChange={(e) => setSelectedProfileId(Number(e.target.value))}
              className="rounded-md border border-border bg-background-card px-3 py-1.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* ── Conversion Funnel ───────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83C\uDFC6"} Conversion Funnel
        </h2>
        <div className="rounded-lg border border-border bg-background-card p-6">
          {loading ? (
            <p className="text-[13px] text-foreground-muted">Loading funnel...</p>
          ) : (
            <>
              {/* Funnel bars */}
              <div className="flex items-end gap-3">
                {funnelStages.map((stage, index) => {
                  const widthPct = maxFunnel ? (stage.value / maxFunnel) * 100 : 0;
                  const nextStage = funnelStages[index + 1];
                  const conversionRate = nextStage
                    ? stage.value
                      ? ((nextStage.value / stage.value) * 100).toFixed(0)
                      : "0"
                    : null;

                  return (
                    <div key={stage.key} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[18px] font-bold tabular-nums text-foreground">
                        {stage.value.toLocaleString()}
                      </span>
                      <span className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                        {stage.label}
                      </span>
                      <div className="flex w-full items-center">
                        <div className="relative flex-1">
                          <div
                            className={cn(
                              "mx-auto rounded-md transition-all duration-500",
                              funnelColors[index]
                            )}
                            style={{
                              width: `${Math.max(widthPct, 8)}%`,
                              height: `${Math.max(24, widthPct * 1.2)}px`,
                              minWidth: "24px",
                            }}
                          />
                        </div>
                      </div>
                      {conversionRate !== null ? (
                        <div className="mt-1 flex items-center gap-0.5">
                          <ArrowRight className="h-3 w-3 text-foreground-faint" />
                          <span className="text-[11px] font-semibold tabular-nums text-accent">
                            {conversionRate}%
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center gap-0.5">
                          <Zap className="h-3 w-3 text-signal-hot" />
                          <span className="text-[11px] font-semibold text-signal-hot">
                            Closed!
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Horizontal funnel visualization */}
              <div className="mt-6 rounded-lg bg-background-sunken p-4">
                <div className="flex items-center gap-1">
                  {funnelStages.map((stage, index) => {
                    const widthPct = maxFunnel ? (stage.value / maxFunnel) * 100 : 0;
                    return (
                      <div
                        key={stage.key}
                        className={cn(
                          "relative flex items-center justify-center rounded-sm py-2.5 text-[11px] font-bold text-white transition-all",
                          funnelColors[index]
                        )}
                        style={{ width: `${Math.max(widthPct, 8)}%` }}
                      >
                        <span className="truncate px-1">{stage.value}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="text-[12px] font-medium text-foreground-muted">
                    Overall conversion:
                  </span>
                  <span className="text-[14px] font-bold text-accent">
                    {overallConversion}%
                  </span>
                  <span className="text-[12px] text-foreground-muted">
                    from harvest to close
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── Weekly New Leads + Search Terms (2-column) ── */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Weekly New Leads Bar Chart */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            {"\uD83D\uDCCA"} Weekly New Vacancies
          </h2>
          <div className="rounded-lg border border-border bg-background-card p-6">
            <div className="flex gap-3">
              <div className="flex flex-col justify-between py-1 text-right">
                {[weeklyMax, Math.round(weeklyMax * 0.66), Math.round(weeklyMax * 0.33), 0].map(
                  (val) => (
                    <span key={val} className="text-[10px] tabular-nums text-foreground-faint">
                      {val}
                    </span>
                  )
                )}
              </div>

              <div className="flex flex-1 items-end gap-3">
                {weeklyTotals.length === 0 ? (
                  <div className="text-[13px] text-foreground-muted">
                    No harvest data yet.
                  </div>
                ) : (
                  weeklyTotals.map((week) => {
                    const height = (week.total / weeklyMax) * 160;
                    return (
                      <div key={week.label} className="group flex flex-1 flex-col items-center gap-1">
                        <span className="text-[11px] font-bold tabular-nums text-foreground">
                          {week.total}
                        </span>
                        <div className="flex w-full flex-col-reverse items-stretch overflow-hidden rounded-t-md" style={{ height: "160px" }}>
                          <div
                            className="bg-accent transition-all"
                            style={{ height: `${height}px` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-foreground-muted">
                          {week.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className={cn("h-2.5 w-2.5 rounded-full", "bg-accent")} />
                <span className="text-[11px] font-medium text-foreground-muted">
                  New vacancies per week
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Search Term Performance */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            {"\uD83D\uDD11"} Search Term Performance
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-background-card">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 pt-3 pl-5 pr-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Term</th>
                  <th className="pb-3 pt-3 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Vacancies</th>
                  <th className="pb-3 pt-3 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Leads</th>
                  <th className="pb-3 pt-3 pl-3 pr-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted" style={{ minWidth: "160px" }}>Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {termRows.length === 0 ? (
                  <tr>
                    <td className="py-4 pl-5 text-[13px] text-foreground-muted" colSpan={4}>
                      No term performance data yet.
                    </td>
                  </tr>
                ) : (
                  termRows.map((term) => {
                    const isHighPerformer = term.avg_lead_score >= 70;
                    return (
                      <tr key={term.term} className="hover:bg-background-hover transition-colors">
                        <td className="py-2.5 pl-5 pr-3 text-[13px]">
                          <div className="flex items-center gap-1.5">
                            <Search className="h-3 w-3 text-foreground-faint" />
                            <span
                              className={cn(
                                "font-medium",
                                isHighPerformer ? "text-accent" : "text-foreground"
                              )}
                            >
                              {term.term}
                            </span>
                            {isHighPerformer && (
                              <span className="text-[10px]">{"\uD83D\uDD25"}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[13px] tabular-nums text-foreground-secondary">
                          {term.vacancy_count}
                        </td>
                        <td className="py-2.5 px-3 text-[13px] tabular-nums text-foreground-secondary">
                          {term.lead_count}
                        </td>
                        <td className="py-2.5 pl-3 pr-5 text-[13px]">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-200">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isHighPerformer ? "bg-accent" : "bg-sand-400"
                                )}
                                style={{
                                  width: `${(term.avg_lead_score / maxTermScore) * 100}%`,
                                }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-[12px] font-semibold tabular-nums",
                                isHighPerformer ? "text-accent" : "text-foreground-muted"
                              )}
                            >
                              {term.avg_lead_score}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Scoring Accuracy ───────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83C\uDFAF"} Scoring Accuracy Snapshot
        </h2>
        <div className="rounded-lg border border-border bg-background-card p-6">
          {scoringAccuracy ? (
            <>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Avg Scores (Converted vs Rejected)
                  </h3>
                  <div className="space-y-2">
                    {[
                      {
                        label: "Converted",
                        value: scoringAccuracy.converted.avg_composite_score,
                        color: "bg-success",
                      },
                      {
                        label: "Rejected",
                        value: scoringAccuracy.rejected.avg_composite_score,
                        color: "bg-danger",
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="w-20 text-[12px] text-foreground-muted">
                          {row.label}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-200">
                          <div
                            className={cn("h-full", row.color)}
                            style={{ width: `${row.value}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-foreground">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Score Distribution
                  </h3>
                  <div className="space-y-2">
                    {distributionEntries.map(([bucket, count]) => (
                      <div key={bucket} className="flex items-center gap-3">
                        <span className="w-16 text-[12px] text-foreground-muted">
                          {bucket}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-200">
                          <div
                            className="h-full bg-accent"
                            style={{ width: `${(count / distributionMax) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-[12px] font-semibold tabular-nums text-foreground">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1">
                <TrendingUp className="h-3 w-3 text-success" />
                <span className="text-[11px] font-semibold text-success">
                  Score gap: {scoreGap.toFixed(1)} points
                </span>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-foreground-muted">No scoring data yet.</p>
          )}
        </div>
      </section>

      {/* ── Quick Insights Cards ────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{"\uD83D\uDCA1"}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Best Term (Avg Score)
              </span>
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              {bestTerm?.term ?? "No data"}
            </p>
            <p className="mt-1 text-[13px] text-foreground-secondary">
              <span className="font-bold text-accent">
                {bestTerm ? `${bestTerm.avg_lead_score}` : "--"}
              </span>{" "}
              avg lead score
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{"\uD83D\uDCC8"}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Scoring Gap
              </span>
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              {scoreGap.toFixed(1)} points
            </p>
            <p className="mt-1 text-[13px] text-foreground-secondary">
              Converted vs rejected average composite scores
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{"\uD83D\uDD25"}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                High Score Bucket
              </span>
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              {distributionEntries[distributionEntries.length - 1]?.[0] ?? "80-100"}
            </p>
            <p className="mt-1 text-[13px] text-foreground-secondary">
              {distributionEntries[distributionEntries.length - 1]?.[1] ?? 0} leads in top bucket
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer with GIF + Quote ─────────────────── */}
      <footer className="border-t border-border py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="hidden overflow-hidden rounded-lg border border-border-subtle sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={salesGifs.motivation[0]}
                alt="Stay motivated"
                className="h-16 w-24 object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg">{"\uD83D\uDCAA"}</span>
              <div>
                <p className="text-[13px] italic text-foreground-secondary">
                  &ldquo;{quote.text}&rdquo;
                </p>
                <p className="text-[11px] text-foreground-muted">
                  &mdash; {quote.attribution}
                </p>
              </div>
            </div>
          </div>
          <span className="text-[11px] text-foreground-faint">
            Signal Engine v0.1 &middot; {"\uD83D\uDE80"} Numbers &gt; Gut Feelings
          </span>
        </div>
      </footer>
    </div>
  );
}
