"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Target,
  Search,
  ChevronRight,
  Clock,
  Building2,
  ArrowUpDown,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { statusConfig, scoreColor, scoreBgColor, type LeadStatus } from "@/lib/mock-data";
import {
  getLeads,
  getLeadStats,
  getProfiles,
  triggerHarvest,
  type ApiLeadListItem,
  type ApiLeadStats,
  type ApiProfile,
} from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

/* ── Sort options ───────────────────────────────────── */

type SortKey = "composite" | "fit" | "timing" | "newest";

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "composite", label: "Composite Score" },
  { key: "fit", label: "Fit Score" },
  { key: "timing", label: "Timing Score" },
  { key: "newest", label: "Newest First" },
];

/* ── Status filter tabs ─────────────────────────────── */

type StatusFilter = "all" | LeadStatus;

const statusTabs: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hot", label: "\uD83D\uDD25 Hot" },
  { key: "warm", label: "\u2600\uFE0F Warm" },
  { key: "monitor", label: "\uD83D\uDC40 Monitor" },
  { key: "dismissed", label: "\uD83D\uDC4B Dismissed" },
];

/* ── Sales quotes ───────────────────────────────────── */

const closerQuotes = [
  {
    text: "The leads are weak? You're weak.",
    attribution: "Glengarry Glen Ross",
  },
  {
    text: "Leads are like bananas. They go bad quick.",
    attribution: "Sales Wisdom",
  },
  {
    text: "Every 'no' brings you closer to a 'yes.'",
    attribution: "Sales Proverb",
  },
];

/* ── Page ────────────────────────────────────────────── */

export default function LeadBoardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<ApiLeadListItem[]>([]);
  const [leadStats, setLeadStats] = useState<ApiLeadStats | null>(null);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [harvestPending, setHarvestPending] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    if (sortOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [sortOpen]);

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
        setError(toErrorMessage(err, "Failed to load profiles"));
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

    async function loadLeads() {
      setLoading(true);
      setError(null);
      try {
        const sortByMap: Record<SortKey, string> = {
          composite: "composite_score",
          fit: "fit_score",
          timing: "timing_score",
          newest: "created_at",
        };
        const [leadList, stats] = await Promise.all([
          getLeads({
            profileId: selectedProfileId ?? undefined,
            limit: 200,
            sortBy: sortByMap[sortKey],
            sortOrder: "desc",
            status: activeTab === "all" ? undefined : activeTab,
          }),
          getLeadStats(selectedProfileId ?? undefined),
        ]);
        if (cancelled) return;
        setLeads(leadList);
        setLeadStats(stats);
      } catch (err) {
        if (cancelled) return;
        setError(toErrorMessage(err, "Failed to load leads"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLeads();

    return () => {
      cancelled = true;
    };
  }, [activeTab, sortKey, selectedProfileId]);

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (
        searchQuery &&
        !(lead.company_name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [leads, searchQuery]);

  const hotCount = leadStats?.by_status?.hot ?? 0;
  const warmCount = leadStats?.by_status?.warm ?? 0;
  const quote = closerQuotes[1];

  async function handleTriggerHarvest() {
    if (!selectedProfileId) return;
    setHarvestPending(true);
    try {
      await triggerHarvest(selectedProfileId);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to trigger harvest"));
    } finally {
      setHarvestPending(false);
    }
  }

  function handleExport() {
    if (filtered.length === 0) return;

    const headers = [
      "Company",
      "City",
      "Sector",
      "Employees",
      "ERP",
      "Score",
      "Fit",
      "Timing",
      "Status",
      "Vacancies",
      "Days Open",
      "Platforms",
    ];

    function csvCell(value: string | number | null | undefined): string {
      const str = String(value ?? "");
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const rows = filtered.map((lead) =>
      [
        csvCell(lead.company_name),
        csvCell(lead.company_city),
        csvCell(lead.company_sector),
        csvCell(lead.company_employee_range),
        csvCell(lead.company_erp),
        csvCell(lead.composite_score),
        csvCell(lead.fit_score),
        csvCell(lead.timing_score),
        csvCell(lead.status),
        csvCell(lead.vacancy_count),
        csvCell(lead.oldest_vacancy_days),
        csvCell(lead.platform_count),
      ].join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = url;
    link.download = `signal-engine-leads-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-6 py-6">
      {/* ── Page header ──────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
              {"\uD83C\uDFAF"} Lead Board
            </h1>
            <p className="mt-1 text-[15px] leading-relaxed text-foreground-secondary">
              Your hottest prospects, ranked and ready.
            </p>
          </div>

          <div className="flex items-center gap-2">
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
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <button
              onClick={handleTriggerHarvest}
              disabled={harvestPending || !selectedProfileId}
              className={cn(
                "flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]",
                (harvestPending || !selectedProfileId) &&
                  "cursor-not-allowed opacity-70"
              )}
            >
              <Target className="h-3.5 w-3.5" />
              {harvestPending ? "Triggering..." : "Trigger Harvest"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────── */}
      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background-card p-0.5">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-[5px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-foreground text-background"
                  : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-card px-3 py-1.5 transition-colors hover:border-border focus-within:border-accent">
            <Search className="h-3.5 w-3.5 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 bg-transparent text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none"
            />
          </div>

          {/* Sort dropdown */}
          <div ref={sortRef} className="relative">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-background-card px-3 py-1.5 text-[12px] font-medium text-foreground-muted transition-colors hover:border-border hover:text-foreground"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortOptions.find((o) => o.key === sortKey)?.label}
            </button>
            {sortOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-full z-10 mt-1 min-w-[180px] overflow-hidden rounded-md border border-border bg-background-card shadow-lg"
              >
                {sortOptions.map((option) => (
                  <button
                    key={option.key}
                    role="option"
                    aria-selected={sortKey === option.key}
                    onClick={() => {
                      setSortKey(option.key);
                      setSortOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center px-3 py-2 text-left text-[12px] transition-colors hover:bg-background-hover",
                      sortKey === option.key
                        ? "font-semibold text-foreground"
                        : "text-foreground-secondary"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Summary strip ────────────────────────────── */}
      <div className="mb-3 px-1">
        <span className="text-[12px] text-foreground-muted">
          Showing{" "}
          <span className="font-medium text-foreground-secondary tabular-nums">
            {filtered.length}
          </span>{" "}
          lead{filtered.length !== 1 ? "s" : ""}{" "}
          <span className="text-foreground-faint">{"\u00B7"}</span>{" "}
          <span className="font-medium text-signal-hot tabular-nums">
            {hotCount}
          </span>{" "}
          hot{" "}
          <span className="text-foreground-faint">{"\u00B7"}</span>{" "}
          <span className="font-medium text-signal-warm tabular-nums">
            {warmCount}
          </span>{" "}
          warm
        </span>
      </div>

      {/* ── Lead table ───────────────────────────────── */}
      <section className="mb-8">
        <div className="overflow-x-auto rounded-lg border border-border bg-background-card">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-[13px] text-foreground-muted">Loading leads...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="text-3xl">{"\uD83E\uDD14"}</span>
              <p className="mt-2 text-[13px] text-foreground-muted">
                No leads match your filters. Broaden your search or grab a
                coffee.
              </p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Company
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Score
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Status
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Vacancies
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Days Open
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    Platforms
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                    ERP
                  </th>
                  <th className="w-8 px-2 py-2.5">
                    <span className="sr-only">Navigate</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => {
                  const status = statusConfig[lead.status as LeadStatus] ?? statusConfig.monitor;
                  const enrichmentStatus = lead.company_enrichment_status ?? "unknown";
                  const enrichmentLabel =
                    enrichmentStatus === "completed"
                      ? "Enriched"
                      : enrichmentStatus === "failed"
                        ? "Enrichment failed"
                        : enrichmentStatus === "running"
                          ? "Enriching"
                          : enrichmentStatus === "pending"
                            ? "Enrichment pending"
                            : "Enrichment unknown";
                  const extractionQuality =
                    lead.company_extraction_quality != null
                      ? Math.round(lead.company_extraction_quality * 100)
                      : null;
                  return (
                    <tr
                      key={lead.id}
                      className="group cursor-pointer border-b border-border-subtle transition-colors last:border-0 hover:bg-background-hover"
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    >
                      {/* Company */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-sunken">
                            <Building2 className="h-3.5 w-3.5 text-foreground-faint" />
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="truncate text-[13px] font-medium text-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {lead.company_name ?? "Unknown company"}
                            </Link>
                            <span className="text-[11px] text-foreground-muted">
                              {lead.company_city ?? "Location unknown"}
                            </span>
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-foreground-faint">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  enrichmentStatus === "completed"
                                    ? "bg-success/10 text-success"
                                    : enrichmentStatus === "failed"
                                      ? "bg-danger/10 text-danger"
                                      : "bg-sand-100 text-foreground-muted"
                                )}
                              >
                                {enrichmentLabel}
                              </span>
                              {extractionQuality != null && (
                                <span className="tabular-nums">
                                  {extractionQuality}% extracted
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Score */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sand-200">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                scoreBgColor(lead.composite_score)
                              )}
                              style={{ width: `${lead.composite_score}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              "text-[13px] font-semibold tabular-nums",
                              scoreColor(lead.composite_score)
                            )}
                          >
                            {lead.composite_score}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            status.bg,
                            status.color,
                            status.border
                          )}
                        >
                          <span className="text-[10px]">{status.emoji}</span>
                          {status.label}
                        </span>
                      </td>

                      {/* Vacancies */}
                      <td className="px-5 py-3">
                        <span className="text-[13px] tabular-nums text-foreground-secondary">
                          {lead.vacancy_count} open
                        </span>
                      </td>

                      {/* Days Open */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-foreground-faint" />
                          <span
                            className={cn(
                              "text-[13px] tabular-nums",
                              lead.oldest_vacancy_days > 60
                                ? "font-bold text-signal-hot"
                                : "text-foreground-secondary"
                            )}
                          >
                            {lead.oldest_vacancy_days}d
                          </span>
                        </div>
                      </td>

                      {/* Platforms */}
                      <td className="px-5 py-3">
                        <span className="text-[12px] text-foreground-secondary">
                          {lead.platform_count} {lead.platform_count === 1 ? "source" : "sources"}
                        </span>
                      </td>

                      {/* ERP */}
                      <td className="px-5 py-3">
                        <span className="inline-flex w-fit rounded border border-border-subtle px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground-muted">
                          {lead.company_erp ?? "-"}
                        </span>
                      </td>

                      {/* Arrow */}
                      <td className="px-2 py-3">
                        <ChevronRight className="h-4 w-4 text-foreground-faint opacity-0 transition-opacity group-hover:opacity-100" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Motivational quote footer ────────────────── */}
      <footer className="border-t border-border py-6">
        <div className="flex items-center justify-between">
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
          <span className="text-[11px] text-foreground-faint">
            Signal Engine v0.1 {"\u00B7"} {"\uD83D\uDE80"} Go close something
          </span>
        </div>
      </footer>
    </div>
  );
}
