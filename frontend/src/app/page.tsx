"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Target,
  TrendingUp,
  ChevronRight,
  Clock,
  Radar,
  Zap,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import {
  mockLeads,
  mockHarvestRuns,
  mockProfiles,
  mockAnalytics,
  statusConfig,
  scoreBgColor,
  formatRelativeTime,
} from "@/lib/mock-data";
import { salesGifs, getRandomQuote } from "@/lib/sales-gifs";

export default function DashboardPage() {
  const quote = useMemo(() => getRandomQuote(), []);
  const hotLeads = mockLeads.filter((l) => l.status === "hot");
  const warmLeads = mockLeads.filter((l) => l.status === "warm");
  const lastHarvest = mockHarvestRuns[0];
  const funnel = mockAnalytics.conversionFunnel;

  return (
    <div className="px-6 py-6">
      {/* ── Welcome header ──────────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
            {"\uD83D\uDD25"} Good morning, closer
          </h1>
          <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
            {hotLeads.length} hot leads waiting.{" "}
            {lastHarvest.stats.newVacancies} new vacancies since yesterday.
            Let&apos;s go.
          </p>
        </div>
        <div className="hidden lg:block">
          <div className="relative overflow-hidden rounded-lg border border-border-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={salesGifs.alwaysBeClosing[0]}
              alt="Always Be Closing"
              className="h-24 w-40 object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-sand-900/80 to-transparent px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                Always Be Closing
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          emoji={"\uD83D\uDD25"}
          label="Hot Leads"
          value={String(hotLeads.length)}
          change="+3 today"
          trend="up"
        />
        <StatCard
          emoji={"\u2600\uFE0F"}
          label="Warm Leads"
          value={String(warmLeads.length)}
          change="+7 this week"
          trend="up"
        />
        <StatCard
          emoji={"\uD83C\uDFE2"}
          label="Companies Tracked"
          value="847"
          change="142 new"
          trend="up"
        />
        <StatCard
          emoji={"\uD83D\uDCB0"}
          label="Conversion Rate"
          value={`${((funnel.converted / funnel.contacted) * 100).toFixed(0)}%`}
          change="+2.3% vs last month"
          trend="up"
        />
      </div>

      {/* ── Two-column layout ────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── Left: Hot leads ──────────────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hot leads table */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {"\uD83D\uDD25"} Hottest Leads
              </h2>
              <Link
                href="/leads"
                className="flex items-center gap-1 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
              >
                View all leads
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-background-card">
              <div className="grid grid-cols-[1fr_90px_90px_90px_90px_32px] gap-3 border-b border-border px-5 py-2.5">
                {["Company", "Score", "Status", "Vacancies", "Days Open", ""].map(
                  (h) => (
                    <span
                      key={h}
                      className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted"
                    >
                      {h}
                    </span>
                  )
                )}
              </div>
              {mockLeads.slice(0, 5).map((lead) => {
                const status = statusConfig[lead.status];
                return (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="group grid grid-cols-[1fr_90px_90px_90px_90px_32px] items-center gap-3 border-b border-border-subtle px-5 py-3 transition-colors last:border-0 hover:bg-background-hover"
                  >
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium text-foreground">
                        {lead.company.name}
                      </span>
                      <span className="text-[11px] text-foreground-muted">
                        {lead.company.city} · {lead.company.sector}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-sand-200">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            scoreBgColor(lead.compositeScore)
                          )}
                          style={{ width: `${lead.compositeScore}%` }}
                        />
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums text-foreground">
                        {lead.compositeScore}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        status.bg,
                        status.color
                      )}
                    >
                      {status.emoji} {status.label}
                    </span>
                    <span className="text-[13px] tabular-nums text-foreground-secondary">
                      {lead.vacancyCount} open
                    </span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-foreground-faint" />
                      <span
                        className={cn(
                          "text-[13px] tabular-nums",
                          lead.oldestVacancyDays > 60
                            ? "font-medium text-signal-hot"
                            : "text-foreground-secondary"
                        )}
                      >
                        {lead.oldestVacancyDays}d
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-foreground-faint transition-colors group-hover:text-foreground" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Mini funnel */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              {"\uD83C\uDFC6"} Conversion Funnel
            </h2>
            <div className="rounded-lg border border-border bg-background-card p-5">
              <div className="space-y-2">
                {[
                  { label: "Harvested", value: funnel.harvested, emoji: "\uD83D\uDE9C" },
                  { label: "Enriched", value: funnel.enriched, emoji: "\uD83E\uDDEA" },
                  { label: "Qualified", value: funnel.qualified, emoji: "\u2705" },
                  { label: "Contacted", value: funnel.contacted, emoji: "\uD83D\uDCE7" },
                  { label: "Meeting", value: funnel.meeting, emoji: "\uD83E\uDD1D" },
                  { label: "Converted", value: funnel.converted, emoji: "\uD83D\uDCB0" },
                ].map((stage, i) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <span className="w-24 text-[12px] text-foreground-muted">
                      {stage.emoji} {stage.label}
                    </span>
                    <div className="flex-1">
                      <div className="h-5 overflow-hidden rounded bg-sand-100">
                        <div
                          className="flex h-full items-center rounded bg-accent px-2"
                          style={{
                            width: `${(stage.value / funnel.harvested) * 100}%`,
                            opacity: 0.15 + i * 0.15,
                          } as React.CSSProperties}
                        >
                          <span className="text-[11px] font-semibold tabular-nums text-foreground">
                            {stage.value.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {i > 0 && (
                      <span className="w-12 text-right text-[11px] tabular-nums text-foreground-muted">
                        {(
                          (stage.value /
                            [
                              funnel.harvested,
                              funnel.enriched,
                              funnel.qualified,
                              funnel.contacted,
                              funnel.meeting,
                            ][i - 1]) *
                          100
                        ).toFixed(0)}
                        %
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────── */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick actions */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\u26A1"} Quick Actions
            </h3>
            <div className="space-y-2">
              <Link
                href="/leads"
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover"
              >
                <Target className="h-4 w-4 text-signal-hot" />
                Review hot leads
                <span className="ml-auto rounded-full bg-signal-hot/10 px-2 py-0.5 text-[11px] font-semibold text-signal-hot">
                  {hotLeads.length}
                </span>
              </Link>
              <Link
                href="/harvest"
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover"
              >
                <Radar className="h-4 w-4 text-accent" />
                Trigger new harvest
              </Link>
              <Link
                href="/scoring"
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover"
              >
                <Zap className="h-4 w-4 text-warning" />
                Tune scoring weights
              </Link>
              <Link
                href="/analytics"
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover"
              >
                <TrendingUp className="h-4 w-4 text-success" />
                View analytics
              </Link>
            </div>
          </div>

          {/* Recent harvest */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\uD83D\uDE9C"} Last Harvest
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-foreground">
                  {lastHarvest.profileName}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                  {"\u2705"} Completed
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "Vacancies",
                    value: lastHarvest.stats.vacanciesFound,
                  },
                  { label: "New", value: lastHarvest.stats.newVacancies },
                  {
                    label: "Companies",
                    value: lastHarvest.stats.companiesMatched,
                  },
                  { label: "Errors", value: lastHarvest.stats.errors },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-md bg-background-sunken px-3 py-2"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-faint">
                      {s.label}
                    </span>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-foreground-muted">
                {formatRelativeTime(lastHarvest.completedAt || "")}
              </p>
            </div>
          </div>

          {/* Active profiles */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\uD83D\uDD0D"} Active Profiles
            </h3>
            <div className="space-y-2">
              {mockProfiles.map((profile) => (
                <Link
                  key={profile.id}
                  href="/profiles"
                  className="group flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-background-hover"
                >
                  <div>
                    <span className="text-[13px] font-medium text-foreground">
                      {profile.name}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-foreground-faint">
                      {profile.slug}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {profile.hotLeads > 0 && (
                      <span className="text-[11px] tabular-nums text-signal-hot">
                        {"\uD83D\uDD25"} {profile.hotLeads}
                      </span>
                    )}
                    <span className="text-[11px] tabular-nums text-foreground-muted">
                      {profile.activeLeads} leads
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Motivational */}
          <div className="relative overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={salesGifs.motivation[0]}
              alt="Motivation"
              className="h-36 w-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-linear-to-t from-sand-900/90 via-sand-900/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 px-4 py-3">
              <p className="text-[13px] font-medium italic text-white">
                &ldquo;{quote.text}&rdquo;
              </p>
              <p className="text-[11px] text-sand-400">
                &mdash; {quote.attribution}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
