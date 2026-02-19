"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  statusConfig,
  scoreBgColor,
  formatRelativeTime,
} from "@/lib/mock-data";
import { salesGifs, getRandomQuote } from "@/lib/sales-gifs";
import {
  getAnalyticsFunnel,
  getHarvestRuns,
  getLeadStats,
  getLeads,
  getProfiles,
  type ApiAnalyticsFunnel,
  type ApiHarvestRun,
  type ApiLeadListItem,
  type ApiLeadStats,
  type ApiProfile,
} from "@/lib/api";

export default function DashboardPage() {
  const quote = useMemo(() => getRandomQuote(), []);

  const [leads, setLeads] = useState<ApiLeadListItem[]>([]);
  const [allLeads, setAllLeads] = useState<ApiLeadListItem[]>([]);
  const [leadStats, setLeadStats] = useState<ApiLeadStats | null>(null);
  const [funnel, setFunnel] = useState<ApiAnalyticsFunnel | null>(null);
  const [harvestRuns, setHarvestRuns] = useState<ApiHarvestRun[]>([]);
  const [allHarvestRuns, setAllHarvestRuns] = useState<ApiHarvestRun[]>([]);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfiles() {
      try {
        const [profilesRes, allLeadsRes, allRuns] = await Promise.all([
          getProfiles(),
          getLeads({ limit: 500 }),
          getHarvestRuns(),
        ]);
        if (cancelled) return;
        setProfiles(profilesRes);
        setAllLeads(allLeadsRes);
        setAllHarvestRuns(allRuns);
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

    async function loadProfileData() {
      setLoading(true);
      setError(null);
      try {
        const pid = selectedProfileId ?? undefined;
        const [leadList, stats, funnelRes, runs] = await Promise.all([
          getLeads({
            profileId: pid,
            limit: 200,
            sortBy: "composite_score",
            sortOrder: "desc",
          }),
          getLeadStats(pid),
          getAnalyticsFunnel(pid),
          getHarvestRuns(pid),
        ]);

        if (cancelled) return;
        setLeads(leadList);
        setLeadStats(stats);
        setFunnel(funnelRes);
        setHarvestRuns(runs);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfileData();

    return () => {
      cancelled = true;
    };
  }, [selectedProfileId]);

  const hotLeads = useMemo(
    () => leads.filter((l) => l.status === "hot"),
    [leads]
  );
  const warmLeads = useMemo(
    () => leads.filter((l) => l.status === "warm"),
    [leads]
  );
  const lastHarvest = harvestRuns[0];
  const funnelMap = useMemo(() => {
    const map = new Map<string, number>();
    funnel?.funnel.forEach((stage) => map.set(stage.stage, stage.count));
    return map;
  }, [funnel]);

  const funnelCounts = {
    harvested: funnelMap.get("vacancies_harvested") ?? 0,
    enriched: funnelMap.get("vacancies_enriched") ?? 0,
    qualified: funnelMap.get("leads_qualified") ?? 0,
    contacted: funnelMap.get("leads_contacted") ?? 0,
    meeting: 0,
    converted: funnelMap.get("leads_converted") ?? 0,
  };

  const conversionRate = funnelCounts.contacted
    ? Math.round((funnelCounts.converted / funnelCounts.contacted) * 100)
    : 0;
  const companiesTracked = useMemo(() => {
    return new Set(leads.map((lead) => lead.company_id)).size;
  }, [leads]);

  const profileLeadCounts = useMemo(() => {
    const counts = new Map<number, { total: number; hot: number }>();
    for (const lead of allLeads) {
      const current = counts.get(lead.search_profile_id) ?? { total: 0, hot: 0 };
      current.total += 1;
      if (lead.status === "hot") current.hot += 1;
      counts.set(lead.search_profile_id, current);
    }
    return counts;
  }, [allLeads]);

  const harvestByProfile = useMemo(() => {
    const map = new Map<number, ApiHarvestRun>();
    for (const run of allHarvestRuns) {
      if (!map.has(run.profile_id)) {
        map.set(run.profile_id, run);
      }
    }
    return map;
  }, [allHarvestRuns]);

  const profileNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const profile of profiles) {
      map.set(profile.id, profile.name);
    }
    return map;
  }, [profiles]);

  return (
    <div className="px-6 py-6">
      {/* ── Welcome header ──────────────────────────── */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
            {"\uD83D\uDD25"} Good morning, closer
          </h1>
          <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
            {hotLeads.length} hot leads waiting. {" "}
            {lastHarvest?.vacancies_new ?? 0} new vacancies since last harvest.
          </p>
          <div className="mt-3 flex items-center gap-2">
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
        <div className="hidden lg:block">
          <div className="relative overflow-hidden rounded-lg border border-border-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={salesGifs.alwaysBeClosing[0]}
              alt="Always Be Closing"
              className="h-24 w-40 object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-sand-900/80 to-transparent px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                Always Be Closing
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* ── Stats row ────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          emoji={"\uD83D\uDD25"}
          label="Hot Leads"
          value={String(leadStats?.by_status?.hot ?? hotLeads.length)}
          change="Updated live"
          trend="up"
        />
        <StatCard
          emoji={"\u2600\uFE0F"}
          label="Warm Leads"
          value={String(leadStats?.by_status?.warm ?? warmLeads.length)}
          change="Updated live"
          trend="up"
        />
        <StatCard
          emoji={"\uD83C\uDFE2"}
          label="Companies Tracked"
          value={String(companiesTracked)}
          change="Profile scope"
          trend="up"
        />
        <StatCard
          emoji={"\uD83D\uDCB0"}
          label="Conversion Rate"
          value={`${conversionRate}%`}
          change="Based on contacted leads"
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
                {[
                  "Company",
                  "Score",
                  "Status",
                  "Vacancies",
                  "Days Open",
                  "",
                ].map((h) => (
                  <span
                    key={h}
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted"
                  >
                    {h}
                  </span>
                ))}
              </div>
              {loading ? (
                <div className="px-5 py-6 text-[13px] text-foreground-muted">
                  Loading leads...
                </div>
              ) : hotLeads.length === 0 ? (
                <div className="px-5 py-6 text-[13px] text-foreground-muted">
                  No hot leads yet. Trigger a harvest to get started.
                </div>
              ) : (
                hotLeads.slice(0, 5).map((lead) => {
                  const status = statusConfig[lead.status as keyof typeof statusConfig];
                  return (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="group grid grid-cols-[1fr_90px_90px_90px_90px_32px] items-center gap-3 border-b border-border-subtle px-5 py-3 transition-colors last:border-0 hover:bg-background-hover"
                    >
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium text-foreground">
                          {lead.company_name ?? "Unknown company"}
                        </span>
                        <span className="text-[11px] text-foreground-muted">
                          {lead.company_city ?? "Location unknown"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-sand-200">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              scoreBgColor(lead.composite_score)
                            )}
                            style={{ width: `${lead.composite_score}%` }}
                          />
                        </div>
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                          {lead.composite_score}
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
                        {lead.vacancy_count} open
                      </span>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-foreground-faint" />
                        <span
                          className={cn(
                            "text-[13px] tabular-nums",
                            lead.oldest_vacancy_days > 60
                              ? "font-medium text-signal-hot"
                              : "text-foreground-secondary"
                          )}
                        >
                          {lead.oldest_vacancy_days}d
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-foreground-faint transition-colors group-hover:text-foreground" />
                    </Link>
                  );
                })
              )}
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
                  {
                    label: "Harvested",
                    value: funnelCounts.harvested,
                    emoji: "\uD83D\uDE9C",
                  },
                  { label: "Enriched", value: funnelCounts.enriched, emoji: "\uD83E\uDDEA" },
                  { label: "Qualified", value: funnelCounts.qualified, emoji: "\u2705" },
                  { label: "Contacted", value: funnelCounts.contacted, emoji: "\uD83D\uDCE7" },
                  { label: "Meeting", value: funnelCounts.meeting, emoji: "\uD83E\uDD1D" },
                  { label: "Converted", value: funnelCounts.converted, emoji: "\uD83D\uDCB0" },
                ].map((stage, i, arr) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <span className="w-24 text-[12px] text-foreground-muted">
                      {stage.emoji} {stage.label}
                    </span>
                    <div className="flex-1">
                      <div className="h-5 overflow-hidden rounded bg-sand-100">
                        <div
                          className="flex h-full items-center rounded bg-accent px-2"
                          style={{
                            width: funnelCounts.harvested
                              ? `${(stage.value / funnelCounts.harvested) * 100}%`
                              : "0%",
                            opacity: 0.15 + i * 0.15,
                          } as CSSProperties}
                        >
                          <span className="text-[11px] font-semibold tabular-nums text-foreground">
                            {stage.value.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {i > 0 && arr[i - 1].value > 0 && (
                      <span className="w-12 text-right text-[11px] tabular-nums text-foreground-muted">
                        {((stage.value / arr[i - 1].value) * 100).toFixed(0)}%
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
            {lastHarvest ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-foreground">
                    {profileNameById.get(lastHarvest.profile_id) ?? `Profile ${lastHarvest.profile_id}`}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-muted">
                    {lastHarvest.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: "Vacancies",
                      value: lastHarvest.vacancies_found,
                    },
                    { label: "New", value: lastHarvest.vacancies_new },
                    {
                      label: "Companies",
                      value: 0,
                    },
                    { label: "Errors", value: lastHarvest.error_message ? 1 : 0 },
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
                  {formatRelativeTime(lastHarvest.completed_at || lastHarvest.started_at || "")}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-foreground-muted">
                No harvest runs yet.
              </p>
            )}
          </div>

          {/* Active profiles */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\uD83D\uDD0D"} Active Profiles
            </h3>
            <div className="space-y-2">
              {profiles.length === 0 ? (
                <p className="text-[12px] text-foreground-muted">
                  No profiles yet. Create one to start harvesting.
                </p>
              ) : (
                profiles.map((profile) => {
                  const counts = profileLeadCounts.get(profile.id) ?? {
                    total: 0,
                    hot: 0,
                  };
                  const lastRun = harvestByProfile.get(profile.id);
                  return (
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
                        {lastRun && (
                          <span className="ml-2 text-[11px] text-foreground-faint">
                            {formatRelativeTime(lastRun.completed_at || lastRun.started_at || "")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {counts.hot > 0 && (
                          <span className="text-[11px] tabular-nums text-signal-hot">
                            {"\uD83D\uDD25"} {counts.hot}
                          </span>
                        )}
                        <span className="text-[11px] tabular-nums text-foreground-muted">
                          {counts.total} leads
                        </span>
                      </div>
                    </Link>
                  );
                })
              )}
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
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
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
