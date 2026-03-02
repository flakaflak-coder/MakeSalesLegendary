"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/mock-data";
import { API_BASE_URL, getObservatory, type ApiObservatoryData } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

interface HealthData {
  status: string;
  db: string;
  external_apis: Record<string, { status: string; code?: number }>;
}

// ── Feature inventory (static registry of what's built) ─────────
type FeatureStatus = "built" | "in_progress" | "planned";

interface Feature {
  name: string;
  status: FeatureStatus;
  category: string;
}

const FEATURES: Feature[] = [
  { name: "Harvesting (SerpAPI)", status: "built", category: "Pipeline" },
  { name: "Harvesting (Indeed)", status: "built", category: "Pipeline" },
  { name: "LLM Extraction", status: "built", category: "Pipeline" },
  { name: "External Enrichment (KvK)", status: "built", category: "Pipeline" },
  { name: "External Enrichment (Apollo)", status: "built", category: "Pipeline" },
  { name: "Scoring Engine", status: "built", category: "Pipeline" },
  { name: "Search Profiles CRUD", status: "built", category: "Core" },
  { name: "Lead Board + Detail", status: "built", category: "Dashboard" },
  { name: "Scoring Tuner", status: "built", category: "Dashboard" },
  { name: "Analytics Dashboard", status: "built", category: "Dashboard" },
  { name: "Harvest Monitor", status: "built", category: "Dashboard" },
  { name: "Event Audit Log", status: "built", category: "Dashboard" },
  { name: "Observatory", status: "built", category: "Dashboard" },
  { name: "Feedback Loop", status: "built", category: "Core" },
  { name: "Health Probes", status: "built", category: "Ops" },
  { name: "Chat Assistant", status: "built", category: "Dashboard" },
  { name: "LinkedIn Jobs Scraper", status: "planned", category: "Pipeline" },
  { name: "CRM Integration (HubSpot)", status: "planned", category: "Integration" },
  { name: "Decision Maker Enrichment (Proxycurl)", status: "planned", category: "Pipeline" },
  { name: "Alerting (Hot Lead Notifications)", status: "planned", category: "Ops" },
  { name: "Scoring A/B Testing", status: "planned", category: "Core" },
  { name: "Company Career Page Scraper", status: "planned", category: "Pipeline" },
];

const statusEmoji: Record<FeatureStatus, string> = { built: "\u2705", in_progress: "\uD83D\uDD28", planned: "\uD83D\uDCCB" };
const statusLabel: Record<FeatureStatus, string> = { built: "Built", in_progress: "In Progress", planned: "Planned" };

export default function ObservatoryPage() {
  const [data, setData] = useState<ApiObservatoryData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [obsData, healthRes] = await Promise.all([
        getObservatory(),
        fetch(`${API_BASE_URL}/health`, { cache: "no-store" })
          .then((r) => r.json() as Promise<HealthData>)
          .catch(() => null),
      ]);
      setData(obsData);
      setHealth(healthRes);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load observatory data"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const builtCount = FEATURES.filter((f) => f.status === "built").length;
  const plannedCount = FEATURES.filter((f) => f.status === "planned").length;

  if (loading) {
    return (
      <div className="px-6 py-6">
        <PageHeader
          emoji={"\uD83D\uDD2D"}
          title="Observatory"
          description="Loading system overview..."
        />
        <div className="mt-8 flex items-center gap-2 text-[13px] text-foreground-muted">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading observatory data...
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <PageHeader
        emoji={"\uD83D\uDD2D"}
        title="Observatory"
        description="Full system visibility — health, pipelines, data quality, and features."
      >
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border border-border bg-background-card px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </PageHeader>

      {error && (
        <div className="rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* ── Summary Cards ───────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              emoji={"\uD83D\uDD0D"}
              label="Profiles"
              value={String(data.entities.profiles)}
              change={`${data.entities.search_terms} terms`}
              trend="up"
            />
            <StatCard
              emoji={"\uD83C\uDFE2"}
              label="Companies"
              value={data.entities.companies.toLocaleString()}
              change={`${data.data_quality.kvk_coverage.percentage}% KvK`}
              trend="up"
            />
            <StatCard
              emoji={"\uD83D\uDCBC"}
              label="Vacancies"
              value={data.entities.vacancies.total.toLocaleString()}
              change={`${data.entities.vacancies.by_status?.active ?? 0} active`}
              trend="up"
            />
            <StatCard
              emoji={"\uD83C\uDFAF"}
              label="Leads"
              value={data.entities.leads.total.toLocaleString()}
              change={`${data.entities.leads.by_status?.hot ?? 0} hot`}
              trend="up"
            />
          </div>

          {/* ── System Health ───────────────────────────── */}
          <Section title="System Health" emoji={"\uD83D\uDFE2"}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Overall status */}
              <HealthCard
                label="Overall"
                status={health?.status ?? "unknown"}
              />
              <HealthCard
                label="Database"
                status={health?.db ?? "unknown"}
              />
              {health?.external_apis &&
                Object.entries(health.external_apis).map(([name, info]) => (
                  <HealthCard
                    key={name}
                    label={name.charAt(0).toUpperCase() + name.slice(1)}
                    status={info.status}
                    detail={info.code ? `HTTP ${info.code}` : undefined}
                  />
                ))}
            </div>
          </Section>

          {/* ── Pipeline Performance ────────────────────── */}
          <Section title="Pipeline Performance (7d)" emoji={"\u2699\uFE0F"}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Harvest */}
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Harvesting
                </h4>
                <div className="space-y-2">
                  <MetricRow label="Runs (7d)" value={sumValues(data.pipeline.harvest.last_7d.by_status)} />
                  <MetricRow
                    label="Completed"
                    value={data.pipeline.harvest.last_7d.by_status?.completed ?? 0}
                    color="text-success"
                  />
                  <MetricRow
                    label="Failed"
                    value={data.pipeline.harvest.last_7d.by_status?.failed ?? 0}
                    color={
                      (data.pipeline.harvest.last_7d.by_status?.failed ?? 0) > 0
                        ? "text-danger"
                        : undefined
                    }
                  />
                  <div className="my-2 border-t border-border-subtle" />
                  <MetricRow label="Vacancies Found" value={data.pipeline.harvest.last_7d.vacancies_found} />
                  <MetricRow label="New Vacancies" value={data.pipeline.harvest.last_7d.vacancies_new} />
                  {data.pipeline.harvest.last_run && (
                    <>
                      <div className="my-2 border-t border-border-subtle" />
                      <div className="text-[11px] text-foreground-muted">
                        Last run:{" "}
                        <span className={cn(
                          "font-medium",
                          data.pipeline.harvest.last_run.status === "completed"
                            ? "text-success"
                            : data.pipeline.harvest.last_run.status === "failed"
                              ? "text-danger"
                              : "text-foreground"
                        )}>
                          {data.pipeline.harvest.last_run.status}
                        </span>
                        {" \u00B7 "}
                        {formatRelativeTime(data.pipeline.harvest.last_run.completed_at ?? data.pipeline.harvest.last_run.started_at ?? "")}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Enrichment */}
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Enrichment (7d)
                </h4>
                {Object.keys(data.pipeline.enrichment.last_7d).length === 0 ? (
                  <p className="text-[12px] text-foreground-muted">No enrichment runs in last 7 days.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(data.pipeline.enrichment.last_7d).map(([passType, stats]) => (
                      <div key={passType}>
                        <span className="text-[12px] font-semibold text-foreground">
                          {passType === "llm" ? "LLM Extraction" : passType === "external" ? "External APIs" : passType}
                        </span>
                        <div className="mt-1 space-y-1">
                          <MetricRow label="Runs" value={stats.runs} />
                          <MetricRow label="Items Processed" value={stats.items_processed} />
                          <MetricRow
                            label="Succeeded"
                            value={stats.items_succeeded}
                            color="text-success"
                          />
                          <MetricRow
                            label="Failed"
                            value={stats.items_failed}
                            color={stats.items_failed > 0 ? "text-danger" : undefined}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* LLM Usage */}
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  LLM Token Usage
                </h4>
                <div className="space-y-2">
                  <span className="text-[12px] font-semibold text-foreground">Last 7 Days</span>
                  <MetricRow label="Input Tokens" value={data.pipeline.llm.tokens_7d.input.toLocaleString()} />
                  <MetricRow label="Output Tokens" value={data.pipeline.llm.tokens_7d.output.toLocaleString()} />
                  <MetricRow label="Total" value={data.pipeline.llm.tokens_7d.total.toLocaleString()} />
                  <div className="my-2 border-t border-border-subtle" />
                  <span className="text-[12px] font-semibold text-foreground">Last 30 Days</span>
                  <MetricRow label="Input Tokens" value={data.pipeline.llm.tokens_30d.input.toLocaleString()} />
                  <MetricRow label="Output Tokens" value={data.pipeline.llm.tokens_30d.output.toLocaleString()} />
                  <MetricRow label="Total" value={data.pipeline.llm.tokens_30d.total.toLocaleString()} />
                </div>
              </div>
            </div>
          </Section>

          {/* ── Data Quality ────────────────────────────── */}
          <Section title="Data Quality" emoji={"\uD83D\uDCCA"}>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Company enrichment */}
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Company Enrichment
                </h4>
                <div className="space-y-2">
                  {Object.entries(data.data_quality.company_enrichment).map(([status, count]) => (
                    <MetricRow
                      key={status}
                      label={status.charAt(0).toUpperCase() + status.slice(1)}
                      value={count}
                      color={
                        status === "completed"
                          ? "text-success"
                          : status === "failed"
                            ? "text-danger"
                            : undefined
                      }
                    />
                  ))}
                  <div className="my-2 border-t border-border-subtle" />
                  <MetricRow
                    label="KvK Coverage"
                    value={`${data.data_quality.kvk_coverage.with_kvk} / ${data.data_quality.kvk_coverage.total}`}
                  />
                  <div className="mt-1">
                    <QualityBar
                      value={data.data_quality.kvk_coverage.percentage}
                      label={`${data.data_quality.kvk_coverage.percentage}%`}
                    />
                  </div>
                </div>
              </div>

              {/* Extraction quality */}
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  LLM Extraction Quality
                </h4>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {(data.data_quality.extraction_quality.average * 100).toFixed(1)}%
                    </span>
                    <span className="text-[12px] text-foreground-muted">average quality</span>
                  </div>
                  <QualityBar
                    value={data.data_quality.extraction_quality.average * 100}
                    label={`${data.data_quality.extraction_quality.companies_with_score} companies scored`}
                  />
                  <div className="my-2 border-t border-border-subtle" />
                  <h5 className="text-[12px] font-semibold text-foreground">Vacancy Extraction</h5>
                  {Object.entries(data.data_quality.vacancy_extraction).map(([status, count]) => (
                    <MetricRow
                      key={status}
                      label={status.charAt(0).toUpperCase() + status.slice(1)}
                      value={count}
                      color={
                        status === "completed"
                          ? "text-success"
                          : status === "failed"
                            ? "text-danger"
                            : undefined
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Scoring health */}
              <div className="rounded-lg border border-border bg-background-card p-5">
                <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Scoring Health
                </h4>
                <div className="space-y-2">
                  <MetricRow label="Avg Composite" value={data.scoring.avg_composite} />
                  <MetricRow label="Avg Fit" value={data.scoring.avg_fit} />
                  <MetricRow label="Avg Timing" value={data.scoring.avg_timing} />
                  <div className="my-2 border-t border-border-subtle" />
                  <MetricRow label="Min Score" value={data.scoring.min_composite} />
                  <MetricRow label="Max Score" value={data.scoring.max_composite} />
                  <MetricRow label="Scored (7d)" value={data.scoring.recently_scored_7d} />
                </div>
                {Object.keys(data.entities.leads.by_status).length > 0 && (
                  <>
                    <div className="my-3 border-t border-border-subtle" />
                    <h5 className="mb-2 text-[12px] font-semibold text-foreground">Lead Distribution</h5>
                    <div className="flex gap-1">
                      {Object.entries(data.entities.leads.by_status).map(([status, count]) => {
                        const total = data.entities.leads.total || 1;
                        const pct = (count / total) * 100;
                        return (
                          <div
                            key={status}
                            className={cn(
                              "h-3 rounded-sm transition-all",
                              status === "hot" && "bg-signal-hot",
                              status === "warm" && "bg-signal-warm",
                              status === "monitor" && "bg-signal-monitor",
                              status === "dismissed" && "bg-signal-dismissed",
                              !["hot", "warm", "monitor", "dismissed"].includes(status) && "bg-sand-300"
                            )}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                            title={`${status}: ${count} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-3">
                      {Object.entries(data.entities.leads.by_status).map(([status, count]) => (
                        <span key={status} className="text-[11px] text-foreground-muted">
                          <span className={cn(
                            "inline-block h-2 w-2 rounded-full mr-1",
                            status === "hot" && "bg-signal-hot",
                            status === "warm" && "bg-signal-warm",
                            status === "monitor" && "bg-signal-monitor",
                            status === "dismissed" && "bg-signal-dismissed",
                            !["hot", "warm", "monitor", "dismissed"].includes(status) && "bg-sand-300"
                          )} />
                          {status} {count}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Section>

          {/* ── Feature Inventory ───────────────────────── */}
          <Section title="Feature Inventory" emoji={"\uD83D\uDEE0\uFE0F"}>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-md bg-success/10 border border-success/20 px-4 py-3 text-center">
                <span className="text-2xl font-bold tabular-nums text-success">{builtCount}</span>
                <p className="text-[11px] font-medium text-success">Built</p>
              </div>
              <div className="rounded-md bg-warning/10 border border-warning/20 px-4 py-3 text-center">
                <span className="text-2xl font-bold tabular-nums text-warning">
                  {FEATURES.filter((f) => f.status === "in_progress").length}
                </span>
                <p className="text-[11px] font-medium text-warning">In Progress</p>
              </div>
              <div className="rounded-md bg-accent-subtle border border-accent-border px-4 py-3 text-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">{plannedCount}</span>
                <p className="text-[11px] font-medium text-foreground-muted">Planned</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-background-card">
              <div className="grid grid-cols-[1fr_100px_120px] gap-3 border-b border-border px-5 py-2.5">
                {["Feature", "Status", "Category"].map((h) => (
                  <span
                    key={h}
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted"
                  >
                    {h}
                  </span>
                ))}
              </div>
              {FEATURES.map((feature) => (
                <div
                  key={feature.name}
                  className="grid grid-cols-[1fr_100px_120px] items-center gap-3 border-b border-border-subtle px-5 py-2.5 last:border-0"
                >
                  <span className="text-[13px] text-foreground">{feature.name}</span>
                  <span className="text-[12px]">
                    {statusEmoji[feature.status]} {statusLabel[feature.status]}
                  </span>
                  <span className="rounded-full bg-background-sunken px-2 py-0.5 text-center text-[11px] font-medium text-foreground-muted">
                    {feature.category}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Feedback Summary ─────────────────────────── */}
          {Object.keys(data.feedback).length > 0 && (
            <Section title="Feedback Summary" emoji={"\uD83D\uDCAC"}>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {Object.entries(data.feedback).map(([action, count]) => (
                  <div key={action} className="rounded-lg border border-border bg-background-card px-5 py-4 text-center">
                    <span className="text-2xl font-bold tabular-nums text-foreground">{count}</span>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                      {action}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Recent Activity ──────────────────────────── */}
          <Section title="Recent Activity" emoji={"\uD83D\uDCCB"}>
            {Object.keys(data.events_24h).length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {Object.entries(data.events_24h).map(([type, count]) => (
                  <span
                    key={type}
                    className="rounded-full border border-border bg-background-card px-3 py-1 text-[11px] font-medium text-foreground-secondary"
                  >
                    {type.replace(/\./g, " \u00B7 ")} <span className="tabular-nums font-semibold">{count}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border bg-background-card">
              <div className="grid grid-cols-[1fr_120px_80px_1fr_100px] gap-3 border-b border-border px-5 py-2.5">
                {["Event", "Entity", "ID", "Metadata", "Time"].map((h) => (
                  <span
                    key={h}
                    className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted"
                  >
                    {h}
                  </span>
                ))}
              </div>
              {data.recent_events.length === 0 ? (
                <div className="px-5 py-6 text-[13px] text-foreground-muted">
                  No events recorded yet.
                </div>
              ) : (
                data.recent_events.map((event) => (
                  <div
                    key={event.id}
                    className="grid grid-cols-[1fr_120px_80px_1fr_100px] items-center gap-3 border-b border-border-subtle px-5 py-2.5 last:border-0"
                  >
                    <span className="text-[12px] font-medium text-foreground">
                      {event.event_type}
                    </span>
                    <span className="text-[12px] text-foreground-secondary">
                      {event.entity_type}
                    </span>
                    <span className="text-[12px] tabular-nums text-foreground-muted">
                      {event.entity_id ?? "-"}
                    </span>
                    <span className="truncate text-[11px] font-mono text-foreground-muted">
                      {Object.keys(event.metadata).length > 0
                        ? JSON.stringify(event.metadata)
                        : "-"}
                    </span>
                    <span className="text-[11px] text-foreground-muted">
                      {formatRelativeTime(event.created_at ?? "")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Section>

          {/* ── Footer ──────────────────────────────────── */}
          <div className="text-[11px] text-foreground-faint">
            Generated at {new Date(data.generated_at).toLocaleString("en-GB")}
          </div>
        </>
      )}
    </div>
  );
}

// ── Helper Components ──────────────────────────────────────

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        {emoji} {title}
      </h2>
      {children}
    </div>
  );
}

function HealthCard({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail?: string;
}) {
  const isOk = status === "ok";
  const isDegraded = status === "degraded";

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 transition-colors",
        isOk && "border-success/20 bg-success/5",
        isDegraded && "border-warning/20 bg-warning/5",
        !isOk && !isDegraded && "border-danger/20 bg-danger/5"
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            isOk && "bg-success",
            isDegraded && "bg-warning",
            !isOk && !isDegraded && "bg-danger"
          )}
        />
        <span className="text-[13px] font-medium text-foreground">{label}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn(
            "text-[12px] font-semibold",
            isOk && "text-success",
            isDegraded && "text-warning",
            !isOk && !isDegraded && "text-danger"
          )}
        >
          {status.toUpperCase()}
        </span>
        {detail && (
          <span className="text-[11px] text-foreground-muted">{detail}</span>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-foreground-muted">{label}</span>
      <span className={cn("text-[13px] font-semibold tabular-nums", color ?? "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function QualityBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sand-200">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 75 ? "bg-success" : value >= 50 ? "bg-warning" : "bg-danger"
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="mt-0.5 text-[10px] text-foreground-muted">{label}</span>
    </div>
  );
}

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((sum, v) => sum + v, 0);
}
