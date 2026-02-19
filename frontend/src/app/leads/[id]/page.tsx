"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Hash,
  Users,
  TrendingUp,
  Globe,
  Send,
  ChevronDown,
  ExternalLink,
  Linkedin,
  Phone,
  Factory,
  Calendar,
  DollarSign,
  Tag,
  DatabaseZap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  statusConfig,
  scoreColor,
  scoreBgColor,
  formatDate,
  formatRelativeTime,
  type LeadStatus,
} from "@/lib/mock-data";
import { getRandomGif, getRandomQuote } from "@/lib/sales-gifs";
import {
  createLeadFeedback,
  getLead,
  getProfiles,
  updateLeadStatus,
  type ApiLeadDetail,
  type ApiProfile,
} from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

// ── Feedback action config ──────────────────────────

const feedbackActionConfig = {
  contacted: {
    label: "Contacted",
    emoji: "\u{1F4DE}",
    color: "text-accent",
    bg: "bg-accent-subtle",
    border: "border-accent-border",
  },
  meeting: {
    label: "Meeting",
    emoji: "\u{1F91D}",
    color: "text-signal-warm",
    bg: "bg-signal-warm/10",
    border: "border-signal-warm/20",
  },
  converted: {
    label: "Converted",
    emoji: "\u{1F389}",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
  },
  rejected: {
    label: "Rejected",
    emoji: "\u{274C}",
    color: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/20",
  },
} as const;

// ── Vacancy source pill colors ──────────────────────

function sourceColor(source: string): string {
  switch (source.toLowerCase()) {
    case "indeed":
      return "bg-signal-warm/10 text-signal-warm border-signal-warm/20";
    case "google jobs":
      return "bg-accent-subtle text-accent border-accent-border";
    case "linkedin":
      return "bg-signal-hot/8 text-signal-hot border-signal-hot/20";
    case "company website":
      return "bg-success/10 text-success border-success/20";
    default:
      return "bg-sand-100 text-foreground-muted border-border";
  }
}

// ── Vacancy status config ───────────────────────────

function vacancyStatusConfig(status: string) {
  switch (status) {
    case "active":
      return { label: "Active", color: "text-success", dot: "bg-success" };
    case "disappeared":
      return { label: "Disappeared", color: "text-warning", dot: "bg-warning" };
    case "filled":
      return {
        label: "Filled",
        color: "text-foreground-muted",
        dot: "bg-foreground-muted",
      };
    default:
      return {
        label: status,
        color: "text-foreground-muted",
        dot: "bg-foreground-muted",
      };
  }
}

// ── Score dots component ────────────────────────────

function ScoreDots({ score, max }: { score: number; max: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-2 rounded-full",
            i < score ? "bg-accent" : "bg-sand-200"
          )}
        />
      ))}
    </div>
  );
}

function toDotScore(score?: number, max: number = 5): number {
  if (!score) return 0;
  const normalized = Math.round(score / 20);
  return Math.min(max, Math.max(0, normalized));
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object") {
    return value as JsonRecord;
  }
  return {};
}

function getScore(breakdown: JsonRecord, key: string): number | undefined {
  const entry = breakdown[key];
  if (!entry || typeof entry !== "object") return undefined;
  const score = (entry as JsonRecord).score;
  return typeof score === "number" ? score : undefined;
}

function getValue(breakdown: JsonRecord, key: string): string | undefined {
  const entry = breakdown[key];
  if (!entry || typeof entry !== "object") return undefined;
  const value = (entry as JsonRecord).value;
  return typeof value === "string" ? value : undefined;
}

function getPoints(breakdown: JsonRecord, key: string): number | undefined {
  const entry = breakdown[key];
  if (!entry || typeof entry !== "object") return undefined;
  const points = (entry as JsonRecord).points;
  return typeof points === "number" ? points : undefined;
}

// ── Apollo enrichment helpers ────────────────────────

function getApolloData(
  enrichmentData: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!enrichmentData) return null;
  const apolloData = enrichmentData.apollo_data;
  if (apolloData && typeof apolloData === "object") {
    return apolloData as Record<string, unknown>;
  }
  return null;
}

function formatApolloRevenue(revenue: unknown): string | null {
  if (typeof revenue !== "number" || revenue <= 0) return null;
  if (revenue >= 1_000_000_000) {
    return `$${(revenue / 1_000_000_000).toFixed(1)}B`;
  }
  if (revenue >= 1_000_000) {
    return `$${(revenue / 1_000_000).toFixed(1)}M`;
  }
  if (revenue >= 1_000) {
    return `$${(revenue / 1_000).toFixed(0)}K`;
  }
  return `$${revenue.toLocaleString()}`;
}

function apolloString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function apolloNumber(value: unknown): number | null {
  if (typeof value === "number" && value > 0) return value;
  return null;
}

function apolloStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
  }
  return [];
}

// ── Page ────────────────────────────────────────────

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [lead, setLead] = useState<ApiLeadDetail | null>(null);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVacancies, setExpandedVacancies] = useState<Set<number>>(
    new Set()
  );
  const [feedbackAction, setFeedbackAction] = useState<string>("");
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [dismissPending, setDismissPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [leadRes, profilesRes] = await Promise.all([
          getLead(Number(id)),
          getProfiles(),
        ]);
        if (cancelled) return;
        setLead(leadRes);
        setProfiles(profilesRes);
      } catch (err) {
        if (cancelled) return;
        setError(toErrorMessage(err, "Failed to load lead"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const gifUrl = useMemo(() => {
    if (!lead) return null;
    const status = lead.status as LeadStatus;
    const category =
      status === "hot" || status === "warm"
        ? "hotLead"
        : status === "dismissed"
          ? "rejection"
          : "motivation";
    return getRandomGif(category);
  }, [lead]);

  const quote = useMemo(() => getRandomQuote(), []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-[13px] text-foreground-muted">Loading lead...</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-4 text-4xl">{"\u{1F50D}"}</span>
        <h1 className="text-xl font-bold text-foreground">Lead not found</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          {error ?? `No lead with ID "${id}" exists.`}
        </p>
        <Link
          href="/leads"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-all duration-100 hover:brightness-[1.2] active:scale-[0.97]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Lead Board
        </Link>
      </div>
    );
  }

  const scoring = asRecord(lead.scoring_breakdown);
  const fit = asRecord(scoring.fit);
  const timing = asRecord(scoring.timing);
  const fitBreakdown = asRecord(fit.breakdown);
  const timingBreakdown = asRecord(timing.breakdown);
  const company = lead.company;
  const enrichmentStatus = company?.enrichment_status ?? "unknown";
  const extractionQuality =
    company?.extraction_quality != null
      ? Math.round(company.extraction_quality * 100)
      : null;

  const vacancies = lead.vacancies.map((vacancy) => {
    const extracted = asRecord(vacancy.extracted_data);
    return {
      id: vacancy.id,
      title: vacancy.job_title,
      source: vacancy.source,
      firstSeenAt: vacancy.first_seen_at ?? "",
      lastSeenAt: vacancy.last_seen_at ?? "",
      status: vacancy.status,
      extractedData: {
        erpSystems: Array.isArray(extracted.erp_systems)
          ? (extracted.erp_systems as string[])
          : [],
        teamSize:
          typeof extracted.team_size === "string" ? extracted.team_size : null,
        volumeIndicators:
          typeof extracted.volume_indicators === "string"
            ? extracted.volume_indicators
            : null,
        automationStatus:
          typeof extracted.automation_status === "string"
            ? extracted.automation_status
            : null,
      },
    };
  });

  const platforms = Array.from(
    new Set(lead.vacancies.map((v) => v.source))
  );

  const profileName = profiles.find((p) => p.id === lead.search_profile_id)?.name;
  const status = statusConfig[lead.status as LeadStatus] ?? statusConfig.monitor;

  function toggleVacancy(vacancyId: number) {
    setExpandedVacancies((prev) => {
      const next = new Set(prev);
      if (next.has(vacancyId)) {
        next.delete(vacancyId);
      } else {
        next.add(vacancyId);
      }
      return next;
    });
  }

  const fitCriteria = [
    {
      key: "entity_count",
      label: "Entity Count",
      value:
        company?.entity_count != null
          ? `${company.entity_count} entities`
          : "Unknown",
      score: getScore(fitBreakdown, "entity_count"),
    },
    {
      key: "employee_count",
      label: "Employee Count",
      value: company?.employee_range ?? "Unknown",
      score: getScore(fitBreakdown, "employee_count"),
    },
    {
      key: "erp_compatibility",
      label: "ERP Compatibility",
      value: getValue(fitBreakdown, "erp_compatibility") ?? "Unknown",
      score: getScore(fitBreakdown, "erp_compatibility"),
    },
    {
      key: "no_existing_automation",
      label: "No Existing Automation",
      value: getValue(fitBreakdown, "no_existing_automation") ?? "Unknown",
      score: getScore(fitBreakdown, "no_existing_automation"),
    },
    {
      key: "sector_fit",
      label: "Sector Fit",
      value: getValue(fitBreakdown, "sector_fit") ?? "Unknown",
      score: getScore(fitBreakdown, "sector_fit"),
    },
    {
      key: "multi_language",
      label: "Multi-Language",
      value: getValue(fitBreakdown, "multi_language") ?? "Unknown",
      score: getScore(fitBreakdown, "multi_language"),
    },
    {
      key: "revenue",
      label: "Revenue Range",
      value: company?.revenue_range ?? "Unknown",
      score: getScore(fitBreakdown, "revenue"),
    },
  ];

  const timingSignals = [
    {
      label: "Vacancy Age >60d",
      points: getPoints(timingBreakdown, "vacancy_age_over_60_days") ?? 0,
    },
    {
      label: "Multiple Vacancies",
      points: getPoints(timingBreakdown, "multiple_vacancies_same_role") ?? 0,
    },
    {
      label: "Repeated Publication",
      points: getPoints(timingBreakdown, "repeated_publication") ?? 0,
    },
    {
      label: "Multi-Platform",
      points: getPoints(timingBreakdown, "multi_platform") ?? 0,
    },
    {
      label: "Management Vacancy",
      points: getPoints(timingBreakdown, "management_vacancy") ?? 0,
    },
  ];

  const activeTimingSignals = timingSignals.filter((s) => s.points > 0);

  async function handleSubmitFeedback() {
    if (!feedbackAction || !lead) return;
    setFeedbackPending(true);
    try {
      await createLeadFeedback(lead.id, {
        action: feedbackAction,
        reason: feedbackReason || undefined,
        notes: feedbackNotes || undefined,
      });
      const updated = await getLead(lead.id);
      setLead(updated);
      setFeedbackAction("");
      setFeedbackReason("");
      setFeedbackNotes("");
    } catch (err) {
      setError(toErrorMessage(err, "Failed to submit feedback"));
    } finally {
      setFeedbackPending(false);
    }
  }

  async function handleDismissLead() {
    if (!lead) return;
    setDismissPending(true);
    try {
      await updateLeadStatus(lead.id, "dismissed");
      const updated = await getLead(lead.id);
      setLead(updated);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to dismiss lead"));
    } finally {
      setDismissPending(false);
    }
  }

  return (
    <div className="px-6 py-6">
      {/* ── Back link ──────────────────────────────── */}
      <Link
        href="/leads"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Lead Board
      </Link>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {company && enrichmentStatus !== "completed" && (
        <div className="mb-4 rounded-md border border-warning/20 bg-warning/10 px-4 py-3 text-[13px] text-warning">
          Enrichment is {enrichmentStatus}. Some company details may be missing.
        </div>
      )}

      {/* ── Two-column layout ─────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ════════ LEFT COLUMN ════════ */}
        <div className="space-y-6 lg:col-span-8">
          {/* ── Company Header Card ──────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                {/* Status badge */}
                <span
                  className={cn(
                    "mb-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    status.bg,
                    status.color,
                    status.border
                  )}
                >
                  <span>{status.emoji}</span>
                  <span>{status.label}</span>
                </span>

                {/* Company name */}
                <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
                  {company?.name ?? "Unknown company"}
                </h1>

                {/* Metadata row */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-foreground-secondary">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-foreground-faint" />
                    {(() => {
                      const apollo = getApolloData(company?.enrichment_data);
                      const city = apollo ? apolloString(apollo.city) : null;
                      const country = apollo ? apolloString(apollo.country) : null;
                      if (city && country) return `${city}, ${country}`;
                      if (city) return city;
                      if (country) return country;
                      return "\u2014";
                    })()}
                  </span>
                  <span className="text-foreground-faint">{"\u2502"}</span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-foreground-faint" />
                    {(() => {
                      const apollo = getApolloData(company?.enrichment_data);
                      const industry = apollo ? apolloString(apollo.industry) : null;
                      return industry ?? "\u2014";
                    })()}
                  </span>
                  <span className="text-foreground-faint">{"\u2502"}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-foreground-faint" />
                    {company?.employee_range ?? "Unknown"}
                  </span>
                  <span className="text-foreground-faint">{"\u2502"}</span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-foreground-faint" />
                    {company?.revenue_range ?? "Unknown"}
                  </span>
                  <span className="text-foreground-faint">{"\u2502"}</span>
                  <span className="inline-flex items-center gap-1 text-[12px] text-foreground-muted">
                    Enrichment: {enrichmentStatus}
                    {extractionQuality != null && (
                      <span className="text-foreground-faint">
                        ({extractionQuality}% extracted)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-sand-50 px-2 py-0.5 font-mono text-[11px] text-foreground-muted">
                <Hash className="h-3 w-3" />
                KvK {company?.kvk_number ?? "Unknown"}
              </span>
              {(company?.sbi_codes ?? []).map((code) => (
                <span
                  key={code}
                  className="rounded border border-border-subtle bg-sand-50 px-2 py-0.5 font-mono text-[11px] text-foreground-muted"
                >
                  SBI {code}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-sand-50 px-2 py-0.5 text-[11px] text-foreground-muted">
                <Globe className="h-3 w-3" />
                {company?.entity_count ?? 0} entities
              </span>
            </div>

            {/* Enriched timestamp */}
            <p className="mt-3 text-[11px] text-foreground-faint">
              Last scored {formatRelativeTime(lead.scored_at || lead.created_at)}
            </p>
          </div>

          {/* ── Scoring Breakdown Card ───────────── */}
          <div className="rounded-lg border border-border bg-background-card p-6">
            <h2 className="mb-5 text-[15px] font-semibold text-foreground">
              {"\u2696\uFE0F"} Scoring Breakdown
            </h2>

            {/* Composite score prominent display */}
            <div className="mb-6 rounded-lg border border-border-subtle bg-sand-50 px-5 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Composite Score
                </span>
                <span
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    scoreColor(lead.composite_score)
                  )}
                >
                  {lead.composite_score}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-sand-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    scoreBgColor(lead.composite_score)
                  )}
                  style={{ width: `${lead.composite_score}%` }}
                />
              </div>
            </div>

            {/* Two sub-sections side by side */}
            <div className="grid grid-cols-2 gap-6">
              {/* Fit Score */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">
                    Fit Score
                  </span>
                  <span
                    className={cn(
                      "text-[15px] font-bold tabular-nums",
                      scoreColor(lead.fit_score)
                    )}
                  >
                    {lead.fit_score}/100
                  </span>
                </div>
                <div className="space-y-2.5">
                  {fitCriteria.map((criterion) => (
                    <div
                      key={criterion.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-[12px] text-foreground-secondary">
                          {criterion.label}
                        </span>
                        {criterion.value && (
                          <span className="ml-1.5 text-[11px] text-foreground-faint">
                            ({criterion.value})
                          </span>
                        )}
                      </div>
                      <ScoreDots score={toDotScore(criterion.score)} max={5} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Timing Score */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">
                    Timing Score
                  </span>
                  <span
                    className={cn(
                      "text-[15px] font-bold tabular-nums",
                      scoreColor(lead.timing_score)
                    )}
                  >
                    {lead.timing_score}/100
                  </span>
                </div>
                {activeTimingSignals.length > 0 ? (
                  <div className="space-y-2.5">
                    {activeTimingSignals.map((signal) => (
                      <div
                        key={signal.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-[12px] text-foreground-secondary">
                          {signal.label}
                        </span>
                        <span className="text-[12px] font-semibold tabular-nums text-accent">
                          +{signal.points}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-foreground-faint">
                    No active timing signals yet.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Vacancies Card ────────────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-6">
            <h2 className="mb-4 text-[15px] font-semibold text-foreground">
              {"\u{1F4CB}"} Linked Vacancies ({vacancies.length})
            </h2>

            {vacancies.length > 0 ? (
              <div className="space-y-3">
                {vacancies.map((vacancy) => {
                  const isExpanded = expandedVacancies.has(vacancy.id);
                  const vstatus = vacancyStatusConfig(vacancy.status);
                  const hasExtractedData =
                    vacancy.extractedData.erpSystems.length > 0 ||
                    vacancy.extractedData.teamSize ||
                    vacancy.extractedData.volumeIndicators ||
                    vacancy.extractedData.automationStatus;

                  return (
                    <div
                      key={vacancy.id}
                      className="rounded-md border border-border-subtle bg-sand-50 transition-colors hover:border-border"
                    >
                      {/* Vacancy header */}
                      <button
                        type="button"
                        onClick={() => toggleVacancy(vacancy.id)}
                        aria-expanded={isExpanded}
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="text-[13px] font-medium text-foreground">
                              {vacancy.title}
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                  sourceColor(vacancy.source)
                                )}
                              >
                                {vacancy.source}
                              </span>
                              <span className="text-[11px] text-foreground-faint">
                                First seen {formatDate(vacancy.firstSeenAt)}
                              </span>
                              <span className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "h-1.5 w-1.5 rounded-full",
                                    vstatus.dot
                                  )}
                                />
                                <span
                                  className={cn(
                                    "text-[11px] font-medium",
                                    vstatus.color
                                  )}
                                >
                                  {vstatus.label}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                        {hasExtractedData && (
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-foreground-faint transition-transform",
                              isExpanded && "rotate-180"
                            )}
                          />
                        )}
                      </button>

                      {/* Expanded extracted data */}
                      {isExpanded && hasExtractedData && (
                        <div className="border-t border-border-subtle px-4 py-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground-faint">
                            Extracted from vacancy text
                          </p>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            {vacancy.extractedData.erpSystems.length > 0 && (
                              <div>
                                <span className="text-[11px] font-medium text-foreground-muted">
                                  ERP Systems
                                </span>
                                <p className="text-[12px] text-foreground-secondary">
                                  {vacancy.extractedData.erpSystems.join(", ")}
                                </p>
                              </div>
                            )}
                            {vacancy.extractedData.teamSize && (
                              <div>
                                <span className="text-[11px] font-medium text-foreground-muted">
                                  Team Size
                                </span>
                                <p className="text-[12px] text-foreground-secondary">
                                  {vacancy.extractedData.teamSize}
                                </p>
                              </div>
                            )}
                            {vacancy.extractedData.volumeIndicators && (
                              <div>
                                <span className="text-[11px] font-medium text-foreground-muted">
                                  Volume Indicators
                                </span>
                                <p className="text-[12px] text-foreground-secondary">
                                  {vacancy.extractedData.volumeIndicators}
                                </p>
                              </div>
                            )}
                            {vacancy.extractedData.automationStatus && (
                              <div>
                                <span className="text-[11px] font-medium text-foreground-muted">
                                  Automation Status
                                </span>
                                <p className="text-[12px] text-foreground-secondary">
                                  {vacancy.extractedData.automationStatus}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-border-subtle bg-sand-50 px-5 py-10 text-center">
                <p className="text-[13px] text-foreground-muted">
                  No vacancies linked to this lead yet.
                </p>
                <p className="mt-1 text-[11px] text-foreground-faint">
                  Vacancies will appear here after the next harvest run.
                </p>
              </div>
            )}
          </div>

          {/* ── Feedback / Activity Card ─────────── */}
          <div className="rounded-lg border border-border bg-background-card p-6">
            <h2 className="mb-4 text-[15px] font-semibold text-foreground">
              {"\u{1F4AC}"} Activity & Feedback
            </h2>

            {lead.feedback.length > 0 ? (
              <div className="mb-6 space-y-3">
                {lead.feedback.map((entry) => {
                  const actionConfig =
                    feedbackActionConfig[
                      entry.action as keyof typeof feedbackActionConfig
                    ];
                  return (
                    <div
                      key={entry.id}
                      className="flex gap-3 rounded-md border border-border-subtle bg-sand-50 px-4 py-3"
                    >
                      {/* Timeline dot */}
                      <div className="mt-0.5 flex flex-col items-center">
                        <span className="text-sm">{actionConfig?.emoji ?? "\u2022"}</span>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              actionConfig?.bg ?? "bg-sand-100",
                              actionConfig?.color ?? "text-foreground-muted",
                              actionConfig?.border ?? "border-border"
                            )}
                          >
                            {actionConfig?.label ?? entry.action}
                          </span>
                          <span className="text-[11px] text-foreground-faint">
                            {formatDate(entry.created_at ?? "")}
                          </span>
                        </div>
                        {entry.notes && (
                          <p className="mt-1.5 text-[12px] leading-relaxed text-foreground-secondary">
                            {entry.notes}
                          </p>
                        )}
                        {entry.reason && (
                          <p className="mt-1 text-[11px] text-foreground-muted">
                            Reason: {entry.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mb-6 flex flex-col items-center rounded-md border border-border-subtle bg-sand-50 px-5 py-8 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getRandomGif("empty")}
                  alt="No activity yet"
                  className="mb-4 h-32 w-auto rounded-lg border border-border-subtle"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <p className="text-[13px] font-medium text-foreground-secondary">
                  No activity yet — time to make a move! {"\u{1F3AF}"}
                </p>
                <p className="mt-1 text-[11px] text-foreground-faint">
                  Add feedback below to start tracking this lead.
                </p>
              </div>
            )}

            {/* Add Feedback form */}
            <div className="border-t border-border-subtle pt-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Add Feedback
              </h3>
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <select
                    value={feedbackAction}
                    onChange={(e) => setFeedbackAction(e.target.value)}
                    aria-label="Feedback action"
                    className="w-full appearance-none rounded-md border border-border bg-background-card px-3 py-2 pr-8 text-[13px] text-foreground transition-colors focus:border-accent focus:outline-none"
                  >
                    <option value="">Select action...</option>
                    <option value="contacted">{"\u{1F4DE}"} Contacted</option>
                    <option value="meeting">{"\u{1F91D}"} Meeting</option>
                    <option value="converted">{"\u{1F389}"} Converted</option>
                    <option value="rejected">{"\u{274C}"} Rejected</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground-faint" />
                </div>
                <input
                  type="text"
                  value={feedbackReason}
                  onChange={(e) => setFeedbackReason(e.target.value)}
                  placeholder="Reason (e.g. wrong ICP, already using automation, ...)"
                  aria-label="Feedback reason"
                  className="w-full rounded-md border border-border bg-background-card px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-faint transition-colors focus:border-accent focus:outline-none"
                />
                <textarea
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  placeholder="Add notes about this interaction..."
                  aria-label="Feedback notes"
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background-card px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-faint transition-colors focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSubmitFeedback}
                  disabled={feedbackPending || !feedbackAction}
                  className={cn(
                    "inline-flex w-fit items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]",
                    (feedbackPending || !feedbackAction) &&
                      "cursor-not-allowed opacity-70"
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                  {feedbackPending ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ════════ RIGHT COLUMN ════════ */}
        <div className="space-y-6 lg:col-span-4">
          {/* ── Quick Actions Card ───────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              Quick Actions
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-foreground opacity-50 cursor-not-allowed"
              >
                {"\u{1F525}"} Contact Lead
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-[13px] font-medium text-foreground opacity-50 cursor-not-allowed"
              >
                {"\u{1F4E7}"} Export Details
              </button>
              <button
                type="button"
                onClick={handleDismissLead}
                disabled={dismissPending}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-medium text-danger transition-colors hover:bg-danger/5 active:bg-danger/10",
                  dismissPending && "cursor-not-allowed opacity-70"
                )}
              >
                {"\u{1F44B}"} {dismissPending ? "Dismissing..." : "Dismiss Lead"}
              </button>
            </div>
          </div>

          {/* ── Score Summary Card ───────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              Score Summary
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <span
                  className={cn(
                    "block text-2xl font-bold tabular-nums",
                    scoreColor(lead.composite_score)
                  )}
                >
                  {lead.composite_score}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-muted">
                  Composite
                </span>
              </div>
              <div>
                <span
                  className={cn(
                    "block text-2xl font-bold tabular-nums",
                    scoreColor(lead.fit_score)
                  )}
                >
                  {lead.fit_score}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-muted">
                  Fit
                </span>
              </div>
              <div>
                <span
                  className={cn(
                    "block text-2xl font-bold tabular-nums",
                    scoreColor(lead.timing_score)
                  )}
                >
                  {lead.timing_score}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground-muted">
                  Timing
                </span>
              </div>
            </div>
          </div>

          {/* ── At-a-Glance Card ─────────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              At a Glance
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  Vacancies
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">
                  {lead.vacancy_count}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  Oldest vacancy
                </span>
                <span
                  className={cn(
                    "text-[13px] font-semibold tabular-nums",
                    lead.oldest_vacancy_days > 60
                      ? "text-signal-hot"
                      : "text-foreground"
                  )}
                >
                  {lead.oldest_vacancy_days} days
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[12px] text-foreground-secondary">
                  Platforms
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {platforms.length > 0 ? (
                    platforms.map((platform) => (
                      <span
                        key={platform}
                        className="rounded border border-border-subtle bg-sand-50 px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted"
                      >
                        {platform}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-foreground-faint">
                      No sources yet
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  Profile
                </span>
                <span className="rounded border border-accent-border bg-accent-subtle px-2 py-0.5 text-[11px] font-medium text-accent">
                  {profileName ?? `Profile ${lead.search_profile_id}`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  Enrichment
                </span>
                <span className="text-[12px] font-medium text-foreground">
                  {enrichmentStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  Extraction Quality
                </span>
                <span className="text-[12px] font-medium text-foreground">
                  {extractionQuality != null ? `${extractionQuality}%` : "--"}
                </span>
              </div>
            </div>
          </div>

          {/* ── Company Intelligence Card ──────────── */}
          {(() => {
            const apollo = getApolloData(company?.enrichment_data);
            const websiteUrl = apollo ? apolloString(apollo.website_url) : null;
            const linkedinUrl = apollo ? apolloString(apollo.linkedin_url) : null;
            const phone = apollo ? apolloString(apollo.phone) ?? apolloString(apollo.sanitized_phone) : null;
            const industry = apollo ? apolloString(apollo.industry) : null;
            const foundedYear = apollo ? apolloNumber(apollo.founded_year) : null;
            const annualRevenue = apollo ? formatApolloRevenue(apollo.annual_revenue) : null;
            const employeeCount = apollo ? apolloNumber(apollo.estimated_num_employees) : null;
            const keywords = apollo ? apolloStringArray(apollo.keywords) : [];

            const hasAnyData =
              websiteUrl ||
              linkedinUrl ||
              phone ||
              industry ||
              foundedYear ||
              annualRevenue ||
              employeeCount ||
              keywords.length > 0;

            return (
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h3 className="mb-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  <DatabaseZap className="h-3.5 w-3.5" />
                  Company Intelligence
                </h3>

                {hasAnyData ? (
                  <div className="space-y-3">
                    {websiteUrl && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Globe className="h-3 w-3 shrink-0" />
                          Website
                        </span>
                        <a
                          href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 truncate text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
                        >
                          <span className="truncate">
                            {websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                          </span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}

                    {linkedinUrl && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Linkedin className="h-3 w-3 shrink-0" />
                          LinkedIn
                        </span>
                        <a
                          href={linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 truncate text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
                        >
                          <span className="truncate">View profile</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}

                    {phone && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Phone className="h-3 w-3 shrink-0" />
                          Phone
                        </span>
                        <span className="text-[13px] font-medium tabular-nums text-foreground">
                          {phone}
                        </span>
                      </div>
                    )}

                    {industry && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Factory className="h-3 w-3 shrink-0" />
                          Industry
                        </span>
                        <span className="text-right text-[13px] font-medium text-foreground">
                          {industry}
                        </span>
                      </div>
                    )}

                    {foundedYear && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Calendar className="h-3 w-3 shrink-0" />
                          Founded
                        </span>
                        <span className="text-[13px] font-medium tabular-nums text-foreground">
                          {foundedYear}
                        </span>
                      </div>
                    )}

                    {annualRevenue && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <DollarSign className="h-3 w-3 shrink-0" />
                          Annual Revenue
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                          {annualRevenue}
                        </span>
                      </div>
                    )}

                    {employeeCount && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Users className="h-3 w-3 shrink-0" />
                          Employees
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                          {employeeCount.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {keywords.length > 0 && (
                      <div>
                        <span className="mb-2 flex items-center gap-1.5 text-[11px] text-foreground-muted">
                          <Tag className="h-3 w-3 shrink-0" />
                          Keywords
                        </span>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {keywords.slice(0, 8).map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded border border-border-subtle bg-sand-50 px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted"
                            >
                              {keyword}
                            </span>
                          ))}
                          {keywords.length > 8 && (
                            <span className="rounded border border-border-subtle bg-sand-50 px-1.5 py-0.5 text-[10px] font-medium text-foreground-faint">
                              +{keywords.length - 8} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-border-subtle bg-sand-50 px-4 py-6 text-center">
                    <DatabaseZap className="mx-auto mb-2 h-5 w-5 text-foreground-faint" />
                    <p className="text-[12px] text-foreground-muted">
                      No enrichment data yet
                    </p>
                    <p className="mt-1 text-[11px] text-foreground-faint">
                      Run Apollo enrichment to populate company intelligence.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Sales GIF Card ───────────────────── */}
          {gifUrl && (
            <div className="relative overflow-hidden rounded-lg border border-border bg-background-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gifUrl}
                alt="Sales motivation"
                className="h-40 w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sand-900/90 to-transparent px-4 py-3">
                {quote && (
                  <>
                    <p className="text-[12px] font-medium leading-snug text-white">
                      &ldquo;{quote.text}&rdquo;
                    </p>
                    <p className="mt-0.5 text-[10px] text-sand-300">
                      &mdash; {quote.attribution}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
