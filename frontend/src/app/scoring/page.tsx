"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SlidersHorizontal,
  RotateCcw,
  Save,
  Eye,
  ArrowUpDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { statusConfig, scoreColor } from "@/lib/mock-data";
import { getRandomQuote } from "@/lib/sales-gifs";
import {
  getLeads,
  getProfiles,
  getScoringConfig,
  runScoring,
  updateScoringConfig,
  type ApiLeadListItem,
  type ApiProfile,
  type ApiScoringConfig,
} from "@/lib/api";

const DEFAULT_FIT_WEIGHT = 0.6;

const DEFAULT_FIT_CRITERIA: Record<string, number> = {
  employee_count: 0.2,
  entity_count: 0.2,
  erp_compatibility: 0.15,
  no_existing_automation: 0.15,
  revenue: 0.15,
  sector_fit: 0.1,
  multi_language: 0.05,
};

const DEFAULT_TIMING_SIGNALS: Record<string, number> = {
  vacancy_age_over_60_days: 3,
  multiple_vacancies_same_role: 4,
  repeated_publication: 3,
  multi_platform: 2,
  management_vacancy: 2,
};

const FIT_CRITERIA_LABELS: Record<string, string> = {
  employee_count: "Employee Count",
  entity_count: "Entity Count",
  erp_compatibility: "ERP Compatibility",
  no_existing_automation: "No Existing Automation",
  revenue: "Revenue Range",
  sector_fit: "Sector Fit",
  multi_language: "Multi-Language",
};

const TIMING_SIGNAL_LABELS: Record<string, string> = {
  vacancy_age_over_60_days: "Vacancy open > 60 days",
  multiple_vacancies_same_role: "Multiple vacancies same role",
  repeated_publication: "Repeated publication",
  multi_platform: "Multi-platform",
  management_vacancy: "Management vacancy",
};

function classifyStatus(score: number): "hot" | "warm" | "monitor" | "dismissed" {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "monitor";
  return "dismissed";
}

function extractFitWeights(config?: ApiScoringConfig | null): Record<string, number> {
  if (!config?.fit_criteria) return { ...DEFAULT_FIT_CRITERIA };
  const weights: Record<string, number> = { ...DEFAULT_FIT_CRITERIA };
  for (const [key, value] of Object.entries(config.fit_criteria)) {
    if (value && typeof value === "object" && "weight" in value) {
      weights[key] = Number((value as { weight: number }).weight);
    }
  }
  return weights;
}

export default function ScoringTunerPage() {
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [scoringConfig, setScoringConfig] = useState<ApiScoringConfig | null>(null);
  const [leads, setLeads] = useState<ApiLeadListItem[]>([]);
  const [fitWeight, setFitWeight] = useState(DEFAULT_FIT_WEIGHT);
  const [fitCriteria, setFitCriteria] = useState({ ...DEFAULT_FIT_CRITERIA });
  const [timingSignals, setTimingSignals] = useState({ ...DEFAULT_TIMING_SIGNALS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scoringRunning, setScoringRunning] = useState(false);

  const timingWeight = Math.round((1 - fitWeight) * 100) / 100;

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
        const pid = selectedProfileId!;
        const [leadsRes, configRes] = await Promise.all([
          getLeads({ profileId: pid, limit: 500 }),
          getScoringConfig(pid),
        ]);
        if (cancelled) return;
        setLeads(leadsRes);
        setScoringConfig(configRes);
        setFitWeight(configRes.fit_weight ?? DEFAULT_FIT_WEIGHT);
        setFitCriteria(extractFitWeights(configRes));
        setTimingSignals({
          ...DEFAULT_TIMING_SIGNALS,
          ...(configRes.timing_signals ?? {}),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load scoring config");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedProfileId]);

  const fitCriteriaSum = Object.values(fitCriteria).reduce((s, v) => s + v, 0);
  const fitCriteriaSumRounded = Math.round(fitCriteriaSum * 100) / 100;
  const weightsBalanced = Math.abs(fitCriteriaSumRounded - 1.0) < 0.02;

  const quote = useMemo(() => getRandomQuote(), []);

  const recalculatedLeads = useMemo(() => {
    return leads.map((lead) => {
      const newComposite = Math.round(
        lead.fit_score * fitWeight + lead.timing_score * timingWeight
      );
      const change = newComposite - lead.composite_score;
      return {
        ...lead,
        newComposite,
        change,
        newStatus: classifyStatus(newComposite),
      };
    });
  }, [leads, fitWeight, timingWeight]);

  const sortedLeads = useMemo(() => {
    return [...recalculatedLeads].sort((a, b) => b.newComposite - a.newComposite);
  }, [recalculatedLeads]);

  const impactSummary = useMemo(() => {
    const originalHot = leads.filter((l) => l.status === "hot").length;
    const originalWarm = leads.filter((l) => l.status === "warm").length;
    const newHot = recalculatedLeads.filter((l) => l.newStatus === "hot").length;
    const newWarm = recalculatedLeads.filter((l) => l.newStatus === "warm").length;

    let biggestWinner = recalculatedLeads[0];
    let biggestLoser = recalculatedLeads[0];

    for (const lead of recalculatedLeads) {
      if (lead.change > (biggestWinner?.change ?? 0)) biggestWinner = lead;
      if (lead.change < (biggestLoser?.change ?? 0)) biggestLoser = lead;
    }

    return {
      originalHot,
      originalWarm,
      newHot,
      newWarm,
      biggestWinner,
      biggestLoser,
    };
  }, [leads, recalculatedLeads]);

  function handleReset() {
    setFitWeight(DEFAULT_FIT_WEIGHT);
    setFitCriteria({ ...DEFAULT_FIT_CRITERIA });
    setTimingSignals({ ...DEFAULT_TIMING_SIGNALS });
  }

  async function handleSave() {
    if (!selectedProfileId) return;
    setSaving(true);
    try {
      const updatedFitCriteria: Record<string, unknown> = {
        ...(scoringConfig?.fit_criteria ?? {}),
      };
      for (const [key, value] of Object.entries(fitCriteria)) {
        const existing = updatedFitCriteria[key];
        if (existing && typeof existing === "object") {
          updatedFitCriteria[key] = {
            ...(existing as Record<string, unknown>),
            weight: value,
          };
        } else {
          updatedFitCriteria[key] = { weight: value };
        }
      }

      const updated = await updateScoringConfig(selectedProfileId!, {
        fit_weight: fitWeight,
        timing_weight: timingWeight,
        fit_criteria: updatedFitCriteria,
        timing_signals: timingSignals,
      });
      setScoringConfig(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scoring config");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunScoring() {
    if (!selectedProfileId) return;
    setScoringRunning(true);
    try {
      await runScoring(selectedProfileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scoring");
    } finally {
      setScoringRunning(false);
    }
  }

  return (
    <div className="px-6 py-6">
      {/* ── Page header ────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
              {"\u2696\uFE0F"} Scoring Tuner
            </h1>
            <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
              Adjust the weights, watch the board shift. Find the formula that predicts winners.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedProfileId ?? ""}
              onChange={(e) => setSelectedProfileId(Number(e.target.value))}
              className="rounded-md border border-border bg-background-card px-3 py-2 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium text-foreground-muted transition-colors hover:text-foreground hover:bg-background-hover"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !weightsBalanced}
              className={cn(
                "flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]",
                (saving || !weightsBalanced) && "opacity-70 cursor-not-allowed"
              )}
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* ── Two-column layout ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── LEFT COLUMN: Weight Controls (7/12) ──── */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-foreground-muted" />
              <h2 className="text-[14px] font-semibold text-foreground">
                Fit vs Timing Balance
              </h2>
            </div>

            <div className="mb-3 flex items-center justify-between text-[13px] font-medium">
              <span className="text-accent">{"\u2696\uFE0F"} Fit: {fitWeight.toFixed(2)}</span>
              <span className="text-signal-warm">{"\u23F1\uFE0F"} Timing: {timingWeight.toFixed(2)}</span>
            </div>

            <div className="mb-3 flex h-3 overflow-hidden rounded-full">
              <div className="bg-accent transition-all duration-150" style={{ width: `${fitWeight * 100}%` }} />
              <div className="bg-signal-warm transition-all duration-150" style={{ width: `${timingWeight * 100}%` }} />
            </div>

            <input
              id="fit-timing-balance"
              type="range"
              min={0}
              max={100}
              value={fitWeight * 100}
              onChange={(e) => setFitWeight(Math.round(Number(e.target.value)) / 100)}
              aria-label="Fit vs Timing weight balance"
              className="w-full cursor-pointer accent-accent"
            />

            <div className="mt-2 flex justify-between text-[11px] text-foreground-faint">
              <span>All Fit</span>
              <span>Balanced</span>
              <span>All Timing</span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">
                {"\uD83D\uDCCA"} Fit Criteria Weights
              </h2>
              <span className="tabular-nums text-[12px] font-medium text-foreground-muted">
                Sum: {fitCriteriaSumRounded.toFixed(2)}
              </span>
            </div>

            {!weightsBalanced && (
              <div className="mb-4 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-[12px] font-medium text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {"\u26A0\uFE0F"} Weights sum to {fitCriteriaSumRounded.toFixed(2)} — should be 1.0
              </div>
            )}

            <div className="space-y-4">
              {Object.entries(fitCriteria).map(([key, value]) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor={`fit-${key}`}
                      className="text-[12px] font-medium text-foreground-secondary"
                    >
                      {FIT_CRITERIA_LABELS[key] ?? key}
                    </label>
                    <span className="tabular-nums text-[12px] font-semibold text-foreground">
                      {value.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id={`fit-${key}`}
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={value}
                    onChange={(e) =>
                      setFitCriteria((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-full cursor-pointer accent-accent"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">
                {"\u23F1\uFE0F"} Timing Signals
              </h2>
            </div>

            <div className="space-y-4">
              {Object.entries(timingSignals).map(([key, value]) => (
                <div key={key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor={`timing-${key}`}
                      className="text-[12px] font-medium text-foreground-secondary"
                    >
                      {TIMING_SIGNAL_LABELS[key] ?? key}
                    </label>
                    <span className="tabular-nums text-[12px] font-semibold text-foreground">
                      {value}
                    </span>
                  </div>
                  <input
                    id={`timing-${key}`}
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={value}
                    onChange={(e) =>
                      setTimingSignals((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-full cursor-pointer accent-accent"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Preview (5/12) ───────── */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">
                {"\uD83D\uDC40"} Live Impact Preview
              </h2>
              <button
                onClick={handleRunScoring}
                disabled={scoringRunning}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-background-hover",
                  scoringRunning && "opacity-70 cursor-not-allowed"
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                {scoringRunning ? "Running..." : "Run Scoring"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border-subtle px-3 py-2">
                <p className="text-[11px] text-foreground-muted">Hot Leads</p>
                <p className="text-[18px] font-bold text-foreground">
                  {impactSummary.newHot}
                </p>
                <p className="text-[10px] text-foreground-faint">
                  was {impactSummary.originalHot}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle px-3 py-2">
                <p className="text-[11px] text-foreground-muted">Warm Leads</p>
                <p className="text-[18px] font-bold text-foreground">
                  {impactSummary.newWarm}
                </p>
                <p className="text-[10px] text-foreground-faint">
                  was {impactSummary.originalWarm}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-foreground">
                {"\uD83D\uDCCB"} Re-ranked Leads
              </h2>
              <div className="flex items-center gap-1 text-[11px] text-foreground-muted">
                <ArrowUpDown className="h-3 w-3" />
                Sorted by new score
              </div>
            </div>

            {loading ? (
              <p className="text-[13px] text-foreground-muted">Loading leads...</p>
            ) : (
              <div className="space-y-2">
                {sortedLeads.slice(0, 8).map((lead) => {
                  const status = statusConfig[lead.newStatus];
                  return (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">
                          {lead.company_name ?? "Unknown company"}
                        </p>
                        <p className="text-[11px] text-foreground-muted">
                          {lead.company_employee_range ?? "--"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            status.bg,
                            status.color
                          )}
                        >
                          {status.label}
                        </span>
                        <span
                          className={cn(
                            "text-[13px] font-semibold tabular-nums",
                            scoreColor(lead.newComposite)
                          )}
                        >
                          {lead.newComposite}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background-card p-5">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\uD83D\uDCAC"} Quote of the day
            </h3>
            <p className="text-[13px] italic text-foreground-secondary">
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="mt-1 text-[11px] text-foreground-muted">
              &mdash; {quote.attribution}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
