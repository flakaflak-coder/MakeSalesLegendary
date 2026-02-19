"use client";

import { useState } from "react";
import {
  TrendingUp,
  Search,
  ArrowRight,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mockAnalytics, statusConfig } from "@/lib/mock-data";
import { salesGifs, getRandomQuote } from "@/lib/sales-gifs";

/* ── Funnel data ───────────────────────────────────── */

const funnelStages = [
  { key: "harvested", label: "Harvested", value: mockAnalytics.conversionFunnel.harvested },
  { key: "enriched", label: "Enriched", value: mockAnalytics.conversionFunnel.enriched },
  { key: "qualified", label: "Qualified", value: mockAnalytics.conversionFunnel.qualified },
  { key: "contacted", label: "Contacted", value: mockAnalytics.conversionFunnel.contacted },
  { key: "meeting", label: "Meeting", value: mockAnalytics.conversionFunnel.meeting },
  { key: "converted", label: "Converted", value: mockAnalytics.conversionFunnel.converted },
] as const;

const funnelColors = [
  "bg-sand-900",
  "bg-sand-700",
  "bg-sand-600",
  "bg-accent",
  "bg-accent-hover",
  "bg-signal-hot",
];

/* ── Page ──────────────────────────────────────────── */

export default function AnalyticsPage() {
  const [selectedProfile, setSelectedProfile] = useState("ap");
  const quote = getRandomQuote();

  const maxFunnel = funnelStages[0].value;
  const overallConversion = (
    (funnelStages[funnelStages.length - 1].value / funnelStages[0].value) *
    100
  ).toFixed(1);

  /* Sort search terms by conversion rate desc */
  const sortedTerms = [...mockAnalytics.topSearchTerms].sort(
    (a, b) => b.rate - a.rate
  );
  const maxTermRate = Math.max(...sortedTerms.map((t) => t.rate));

  /* Weekly chart max for y-axis scaling */
  const weeklyMax = Math.max(
    ...mockAnalytics.weeklyNewLeads.map((w) => w.hot + w.warm + w.monitor)
  );

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
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="rounded-md border border-border bg-background-card px-3 py-1.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="ap">
                {"\uD83D\uDCBC"} Accounts Payable
              </option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Conversion Funnel ───────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83C\uDFC6"} Conversion Funnel
        </h2>
        <div className="rounded-lg border border-border bg-background-card p-6">
          {/* Funnel bars */}
          <div className="flex items-end gap-3">
            {funnelStages.map((stage, index) => {
              const widthPct = (stage.value / maxFunnel) * 100;
              const nextStage = funnelStages[index + 1];
              const conversionRate = nextStage
                ? ((nextStage.value / stage.value) * 100).toFixed(0)
                : null;

              return (
                <div key={stage.key} className="flex flex-1 flex-col items-center gap-1">
                  {/* Count label */}
                  <span className="text-[18px] font-bold tabular-nums text-foreground">
                    {stage.value.toLocaleString()}
                  </span>
                  {/* Stage name */}
                  <span className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    {stage.label}
                  </span>
                  {/* Bar + arrow container */}
                  <div className="flex w-full items-center">
                    {/* Bar */}
                    <div className="relative flex-1">
                      <div
                        className={cn(
                          "mx-auto rounded-md transition-all duration-500",
                          funnelColors[index]
                        )}
                        style={{
                          width: `${widthPct}%`,
                          height: `${Math.max(24, widthPct * 1.2)}px`,
                          minWidth: "24px",
                        }}
                      />
                    </div>
                  </div>
                  {/* Conversion rate arrow (show below, between this and next) */}
                  {conversionRate !== null && (
                    <div className="mt-1 flex items-center gap-0.5">
                      <ArrowRight className="h-3 w-3 text-foreground-faint" />
                      <span className="text-[11px] font-semibold tabular-nums text-accent">
                        {conversionRate}%
                      </span>
                    </div>
                  )}
                  {conversionRate === null && (
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
                const widthPct = (stage.value / maxFunnel) * 100;
                return (
                  <div
                    key={stage.key}
                    className={cn(
                      "relative flex items-center justify-center rounded-sm py-2.5 text-[11px] font-bold text-white transition-all",
                      funnelColors[index]
                    )}
                    style={{ width: `${Math.max(widthPct, 8)}%` }}
                  >
                    <span className="truncate px-1">
                      {stage.value}
                    </span>
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
        </div>
      </section>

      {/* ── Weekly New Leads + Search Terms (2-column) ── */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Weekly New Leads Bar Chart */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            {"\uD83D\uDCCA"} Weekly New Leads
          </h2>
          <div className="rounded-lg border border-border bg-background-card p-6">
            {/* Y-axis + Bars */}
            <div className="flex gap-3">
              {/* Y-axis labels */}
              <div className="flex flex-col justify-between py-1 text-right">
                {[weeklyMax, Math.round(weeklyMax * 0.66), Math.round(weeklyMax * 0.33), 0].map(
                  (val) => (
                    <span
                      key={val}
                      className="text-[10px] tabular-nums text-foreground-faint"
                    >
                      {val}
                    </span>
                  )
                )}
              </div>

              {/* Bars container */}
              <div className="flex flex-1 items-end gap-3">
                {mockAnalytics.weeklyNewLeads.map((week) => {
                  const total = week.hot + week.warm + week.monitor;
                  const hotH = (week.hot / weeklyMax) * 160;
                  const warmH = (week.warm / weeklyMax) * 160;
                  const monitorH = (week.monitor / weeklyMax) * 160;

                  return (
                    <div
                      key={week.week}
                      className="group flex flex-1 flex-col items-center gap-1"
                    >
                      {/* Total label */}
                      <span className="text-[11px] font-bold tabular-nums text-foreground">
                        {total}
                      </span>
                      {/* Stacked bar */}
                      <div
                        className="flex w-full flex-col-reverse items-stretch overflow-hidden rounded-t-md"
                        style={{ height: "160px" }}
                      >
                        <div
                          className="bg-signal-hot transition-all"
                          style={{ height: `${hotH}px` }}
                          title={`Hot: ${week.hot}`}
                        />
                        <div
                          className="bg-signal-warm transition-all"
                          style={{ height: `${warmH}px` }}
                          title={`Warm: ${week.warm}`}
                        />
                        <div
                          className="bg-signal-monitor transition-all"
                          style={{ height: `${monitorH}px` }}
                          title={`Monitor: ${week.monitor}`}
                        />
                      </div>
                      {/* X-axis label */}
                      <span className="text-[11px] font-medium text-foreground-muted">
                        {week.week}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-center gap-4">
              {[
                { label: "Hot", color: "bg-signal-hot", emoji: statusConfig.hot.emoji },
                { label: "Warm", color: "bg-signal-warm", emoji: statusConfig.warm.emoji },
                { label: "Monitor", color: "bg-signal-monitor", emoji: statusConfig.monitor.emoji },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={cn("h-2.5 w-2.5 rounded-full", item.color)} />
                  <span className="text-[11px] font-medium text-foreground-muted">
                    {item.emoji} {item.label}
                  </span>
                </div>
              ))}
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
                  <th className="pb-3 pt-3 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Leads</th>
                  <th className="pb-3 pt-3 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Conv.</th>
                  <th className="pb-3 pt-3 pl-3 pr-5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted" style={{ minWidth: "140px" }}>Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {sortedTerms.map((term) => {
                  const isHighPerformer = term.rate > 15;
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
                        {term.leads}
                      </td>
                      <td className="py-2.5 px-3 text-[13px] tabular-nums text-foreground-secondary">
                        {term.conversions}
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
                                width: `${maxTermRate > 0 ? (term.rate / maxTermRate) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-[12px] font-semibold tabular-nums",
                              isHighPerformer ? "text-accent" : "text-foreground-muted"
                            )}
                          >
                            {term.rate > 0 ? `${term.rate}%` : "--"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── Scoring Accuracy Over Time ──────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83C\uDFAF"} Scoring Accuracy Over Time
        </h2>
        <div className="rounded-lg border border-border bg-background-card p-6">
          {/* Chart area */}
          <div className="flex gap-3">
            {/* Y-axis */}
            <div className="flex flex-col justify-between py-1 text-right">
              {[100, 80, 60, 40].map((val) => (
                <span
                  key={val}
                  className="text-[10px] tabular-nums text-foreground-faint"
                >
                  {val}%
                </span>
              ))}
            </div>

            {/* Chart body */}
            <div className="relative flex-1">
              {/* Grid lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="border-b border-border-subtle" />
                ))}
              </div>

              {/* Bars */}
              <div className="relative flex items-end gap-4" style={{ height: "180px" }}>
                {mockAnalytics.scoringAccuracy.map((month) => {
                  const predictedH = (month.predicted / 100) * 180;
                  const actualH = (month.actual / 100) * 180;
                  const gap = month.predicted - month.actual;

                  return (
                    <div
                      key={month.month}
                      className="group flex flex-1 flex-col items-center gap-1"
                    >
                      {/* Gap indicator */}
                      <span
                        className={cn(
                          "text-[10px] font-semibold tabular-nums",
                          gap <= 2
                            ? "text-success"
                            : gap <= 4
                              ? "text-warning"
                              : "text-foreground-muted"
                        )}
                      >
                        {gap > 0 ? `\u0394${gap}` : "\u2713"}
                      </span>
                      {/* Paired bars */}
                      <div className="flex w-full items-end justify-center gap-1">
                        {/* Predicted */}
                        <div
                          className="w-[40%] rounded-t-sm bg-accent/70 transition-all"
                          style={{ height: `${predictedH}px` }}
                          title={`Predicted: ${month.predicted}%`}
                        />
                        {/* Actual */}
                        <div
                          className="w-[40%] rounded-t-sm bg-foreground/70 transition-all"
                          style={{ height: `${actualH}px` }}
                          title={`Actual: ${month.actual}%`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-axis */}
              <div className="mt-2 flex">
                {mockAnalytics.scoringAccuracy.map((month) => (
                  <div
                    key={month.month}
                    className="flex-1 text-center text-[11px] font-medium text-foreground-muted"
                  >
                    {month.month}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend + insight */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-accent/70" />
                <span className="text-[11px] font-medium text-foreground-muted">
                  Predicted
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-foreground/70" />
                <span className="text-[11px] font-medium text-foreground-muted">
                  Actual
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold text-success">
                  {"\u0394"} = gap
                </span>
                <span className="text-[11px] text-foreground-muted">
                  (lower is better)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1">
              <TrendingUp className="h-3 w-3 text-success" />
              <span className="text-[11px] font-semibold text-success">
                Converging &mdash; gap narrowed from 4 to 2 points
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick Insights Cards ────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Top Converting Sector */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{"\uD83D\uDCA1"}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Top Converting Sector
              </span>
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              Transport &amp; Logistics
            </p>
            <p className="mt-1 text-[13px] text-foreground-secondary">
              <span className="font-bold text-accent">23%</span> conversion
              rate &mdash; highest across all sectors
            </p>
          </div>

          {/* Scoring Accuracy Trend */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{"\uD83D\uDCC8"}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Scoring Accuracy
              </span>
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              +5% This Quarter
            </p>
            <p className="mt-1 text-[13px] text-foreground-secondary">
              Predicted vs. actual gap narrowed from{" "}
              <span className="font-bold text-success">4 to 2</span> points
            </p>
          </div>

          {/* Best Search Term */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{"\uD83D\uDD25"}</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Best Search Term
              </span>
            </div>
            <p className="text-[15px] font-semibold text-foreground">
              crediteurenadministrateur
            </p>
            <p className="mt-1 text-[13px] text-foreground-secondary">
              <span className="font-bold text-accent">23.5%</span> conversion
              rate &mdash; 8 of 34 leads converted
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer with GIF + Quote ─────────────────── */}
      <footer className="border-t border-border py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Motivational GIF */}
            <div className="hidden overflow-hidden rounded-lg border border-border-subtle sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={salesGifs.motivation[0]}
                alt="Stay motivated"
                className="h-16 w-24 object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
