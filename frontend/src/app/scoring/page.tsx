"use client";

import { useState, useMemo } from "react";
import {
  SlidersHorizontal,
  RotateCcw,
  Save,
  Eye,
  ArrowUpDown,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mockLeads,
  mockProfiles,
  statusConfig,
  scoreColor,
} from "@/lib/mock-data";
import { getRandomQuote } from "@/lib/sales-gifs";

// ── Default weights (from CLAUDE.md scoring config) ──────────

const DEFAULT_FIT_WEIGHT = 0.6;

const DEFAULT_FIT_CRITERIA = {
  invoiceVolume: 0.25,
  entityCount: 0.2,
  employeeCount: 0.15,
  erpCompatibility: 0.15,
  noExistingP2P: 0.1,
  sectorFit: 0.1,
  multiLanguage: 0.05,
};

const DEFAULT_TIMING_SIGNALS = {
  vacancyAge: 3,
  multipleVacancies: 4,
  repeatedPublication: 3,
  relatedVacancies: 2,
  managementVacancy: 2,
};

const FIT_CRITERIA_LABELS: Record<string, string> = {
  invoiceVolume: "Invoice Volume",
  entityCount: "Entity Count",
  employeeCount: "Employee Count",
  erpCompatibility: "ERP Compatibility",
  noExistingP2P: "No Existing P2P Tool",
  sectorFit: "Sector Fit",
  multiLanguage: "Multi-Language",
};

const TIMING_SIGNAL_LABELS: Record<string, string> = {
  vacancyAge: "Vacancy open > 60 days",
  multipleVacancies: "Multiple vacancies same role",
  repeatedPublication: "Repeated publication",
  relatedVacancies: "Related vacancies",
  managementVacancy: "Management vacancy",
};

// ── Helpers ──────────────────────────────────────────────────

function classifyStatus(score: number): "hot" | "warm" | "monitor" | "dismissed" {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  if (score >= 40) return "monitor";
  return "dismissed";
}

// ── Page ─────────────────────────────────────────────────────

export default function ScoringTunerPage() {
  const [fitWeight, setFitWeight] = useState(DEFAULT_FIT_WEIGHT);
  const timingWeight = Math.round((1 - fitWeight) * 100) / 100;

  const [fitCriteria, setFitCriteria] = useState({ ...DEFAULT_FIT_CRITERIA });
  const [timingSignals, setTimingSignals] = useState({ ...DEFAULT_TIMING_SIGNALS });

  const fitCriteriaSum = Object.values(fitCriteria).reduce((s, v) => s + v, 0);
  const fitCriteriaSumRounded = Math.round(fitCriteriaSum * 100) / 100;
  const weightsBalanced = Math.abs(fitCriteriaSumRounded - 1.0) < 0.02;

  const quote = useMemo(() => getRandomQuote(), []);

  // ── Recalculate composite scores with current weights ─────

  const recalculatedLeads = useMemo(() => {
    return mockLeads.map((lead) => {
      const newComposite = Math.round(
        lead.fitScore * fitWeight + lead.timingScore * timingWeight
      );
      const change = newComposite - lead.compositeScore;
      return {
        ...lead,
        newComposite,
        change,
        newStatus: classifyStatus(newComposite),
      };
    });
  }, [fitWeight, timingWeight]);

  const sortedLeads = useMemo(() => {
    return [...recalculatedLeads].sort((a, b) => b.newComposite - a.newComposite);
  }, [recalculatedLeads]);

  // ── Impact summary ────────────────────────────────────────

  const impactSummary = useMemo(() => {
    const originalHot = mockLeads.filter((l) => l.status === "hot").length;
    const originalWarm = mockLeads.filter((l) => l.status === "warm").length;
    const newHot = recalculatedLeads.filter((l) => l.newStatus === "hot").length;
    const newWarm = recalculatedLeads.filter((l) => l.newStatus === "warm").length;

    let biggestWinner = recalculatedLeads[0];
    let biggestLoser = recalculatedLeads[0];

    for (const lead of recalculatedLeads) {
      if (lead.change > biggestWinner.change) biggestWinner = lead;
      if (lead.change < biggestLoser.change) biggestLoser = lead;
    }

    return {
      originalHot,
      originalWarm,
      newHot,
      newWarm,
      biggestWinner,
      biggestLoser,
    };
  }, [recalculatedLeads]);

  // ── Reset handler ─────────────────────────────────────────

  function handleReset() {
    setFitWeight(DEFAULT_FIT_WEIGHT);
    setFitCriteria({ ...DEFAULT_FIT_CRITERIA });
    setTimingSignals({ ...DEFAULT_TIMING_SIGNALS });
  }

  // ── Render ────────────────────────────────────────────────

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
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-medium text-foreground-muted transition-colors hover:text-foreground hover:bg-background-hover"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default
            </button>
            <button className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]">
              <Save className="h-3.5 w-3.5" />
              Save Changes
            </button>
          </div>
        </div>
      </section>

      {/* ── Two-column layout ──────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── LEFT COLUMN: Weight Controls (7/12) ──── */}
        <div className="lg:col-span-7 space-y-6">
          {/* ── Fit vs Timing Balance ──────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-foreground-muted" />
              <h2 className="text-[14px] font-semibold text-foreground">
                Fit vs Timing Balance
              </h2>
            </div>

            <div className="mb-3 flex items-center justify-between text-[13px] font-medium">
              <span className="text-accent">
                {"\u2696\uFE0F"} Fit: {fitWeight.toFixed(2)}
              </span>
              <span className="text-signal-warm">
                {"\u23F1\uFE0F"} Timing: {timingWeight.toFixed(2)}
              </span>
            </div>

            {/* Visual split bar */}
            <div className="mb-3 flex h-3 overflow-hidden rounded-full">
              <div
                className="bg-accent transition-all duration-150"
                style={{ width: `${fitWeight * 100}%` }}
              />
              <div
                className="bg-signal-warm transition-all duration-150"
                style={{ width: `${timingWeight * 100}%` }}
              />
            </div>

            <input
              id="fit-timing-balance"
              type="range"
              min={0}
              max={100}
              value={fitWeight * 100}
              onChange={(e) =>
                setFitWeight(Math.round(Number(e.target.value)) / 100)
              }
              aria-label="Fit vs Timing weight balance"
              className="w-full cursor-pointer accent-accent"
            />

            <div className="mt-2 flex justify-between text-[11px] text-foreground-faint">
              <span>All Fit</span>
              <span>Balanced</span>
              <span>All Timing</span>
            </div>
          </div>

          {/* ── Fit Criteria Weights ───────────────── */}
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
                      {FIT_CRITERIA_LABELS[key]}
                    </label>
                    <span className="tabular-nums text-[12px] font-semibold text-foreground">
                      {value.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id={`fit-${key}`}
                    type="range"
                    min={0}
                    max={50}
                    value={value * 100}
                    onChange={(e) =>
                      setFitCriteria((prev) => ({
                        ...prev,
                        [key]: Math.round(Number(e.target.value)) / 100,
                      }))
                    }
                    aria-label={FIT_CRITERIA_LABELS[key]}
                    className="w-full cursor-pointer accent-accent"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Timing Signal Points ───────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <h2 className="mb-4 text-[14px] font-semibold text-foreground">
              {"\u23F1\uFE0F"} Timing Signal Points
            </h2>

            <div className="space-y-3">
              {Object.entries(timingSignals).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-4"
                >
                  <label
                    htmlFor={`timing-${key}`}
                    className="text-[12px] font-medium text-foreground-secondary"
                  >
                    {TIMING_SIGNAL_LABELS[key]}
                  </label>
                  <input
                    id={`timing-${key}`}
                    type="number"
                    min={0}
                    max={10}
                    value={value}
                    onChange={(e) =>
                      setTimingSignals((prev) => ({
                        ...prev,
                        [key]: Math.max(0, Math.min(10, Number(e.target.value))),
                      }))
                    }
                    aria-label={TIMING_SIGNAL_LABELS[key]}
                    className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-center text-[13px] font-semibold tabular-nums text-foreground focus:border-accent focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Live Preview (5/12) ────── */}
        <div className="lg:col-span-5 space-y-6">
          {/* ── Live Preview ──────────────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Eye className="h-4 w-4 text-foreground-muted" />
              <h2 className="text-[14px] font-semibold text-foreground">
                {"\uD83D\uDC41\uFE0F"} Live Preview
              </h2>
            </div>

            <p className="mb-4 text-[11px] text-foreground-muted">
              Leads re-ranked with your current weights. Scores update as you drag.
            </p>

            <div className="space-y-1">
              {sortedLeads.map((lead, index) => {
                const significantChange = Math.abs(lead.change) > 5;
                const newStatusConf = statusConfig[lead.newStatus];
                const oldStatusConf = statusConfig[lead.status];
                const statusChanged = lead.newStatus !== lead.status;

                return (
                  <div
                    key={lead.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                      significantChange
                        ? lead.change > 0
                          ? "bg-success/5"
                          : "bg-danger/5"
                        : "hover:bg-background-hover"
                    )}
                  >
                    {/* Rank */}
                    <span className="w-5 shrink-0 text-[12px] font-bold tabular-nums text-foreground-faint">
                      {index + 1}.
                    </span>

                    {/* Company info */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-foreground">
                        {lead.company.name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {statusChanged ? (
                          <>
                            <span
                              className={cn(
                                "text-[10px] line-through",
                                oldStatusConf.color
                              )}
                            >
                              {oldStatusConf.emoji} {oldStatusConf.label}
                            </span>
                            <span className="text-[10px] text-foreground-faint">
                              {"\u2192"}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-medium",
                                newStatusConf.color
                              )}
                            >
                              {newStatusConf.emoji} {newStatusConf.label}
                            </span>
                          </>
                        ) : (
                          <span
                            className={cn("text-[10px]", newStatusConf.color)}
                          >
                            {newStatusConf.emoji} {newStatusConf.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Score transition */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[12px] tabular-nums text-foreground-muted">
                        {lead.compositeScore}
                      </span>
                      <span className="text-[10px] text-foreground-faint">
                        {"\u2192"}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-bold tabular-nums",
                          scoreColor(lead.newComposite)
                        )}
                      >
                        {lead.newComposite}
                      </span>
                    </div>

                    {/* Change indicator */}
                    <div className="w-12 shrink-0 text-right">
                      {lead.change !== 0 && (
                        <span
                          className={cn(
                            "text-[11px] font-semibold tabular-nums",
                            lead.change > 0 ? "text-success" : "text-danger",
                            significantChange && "font-bold"
                          )}
                        >
                          {lead.change > 0 ? "\u2191" : "\u2193"}
                          {Math.abs(lead.change)}
                        </span>
                      )}
                      {lead.change === 0 && (
                        <span className="text-[11px] text-foreground-faint">
                          —
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Impact Summary ────────────────────── */}
          <div className="rounded-lg border border-border bg-background-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-foreground-muted" />
              <h2 className="text-[14px] font-semibold text-foreground">
                {"\uD83D\uDCC8"} Impact Summary
              </h2>
            </div>

            <div className="space-y-3">
              {/* Hot leads change */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  {"\uD83D\uDD25"} Hot leads
                </span>
                <div className="flex items-center gap-1.5 tabular-nums text-[13px] font-semibold">
                  <span className="text-foreground-muted">
                    {impactSummary.originalHot}
                  </span>
                  <span className="text-foreground-faint">{"\u2192"}</span>
                  <span
                    className={cn(
                      impactSummary.newHot > impactSummary.originalHot
                        ? "text-success"
                        : impactSummary.newHot < impactSummary.originalHot
                          ? "text-danger"
                          : "text-foreground"
                    )}
                  >
                    {impactSummary.newHot}
                  </span>
                </div>
              </div>

              {/* Warm leads change */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-foreground-secondary">
                  {"\u2600\uFE0F"} Warm leads
                </span>
                <div className="flex items-center gap-1.5 tabular-nums text-[13px] font-semibold">
                  <span className="text-foreground-muted">
                    {impactSummary.originalWarm}
                  </span>
                  <span className="text-foreground-faint">{"\u2192"}</span>
                  <span
                    className={cn(
                      impactSummary.newWarm > impactSummary.originalWarm
                        ? "text-success"
                        : impactSummary.newWarm < impactSummary.originalWarm
                          ? "text-danger"
                          : "text-foreground"
                    )}
                  >
                    {impactSummary.newWarm}
                  </span>
                </div>
              </div>

              <div className="my-2 border-t border-border-subtle" />

              {/* Biggest winner */}
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] text-foreground-faint">
                    {"\uD83C\uDFC6"} Biggest winner
                  </span>
                  <p className="truncate text-[12px] font-medium text-foreground">
                    {impactSummary.biggestWinner.company.name}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-[13px] font-bold text-success">
                  +{impactSummary.biggestWinner.change}
                </span>
              </div>

              {/* Biggest loser */}
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] text-foreground-faint">
                    {"\uD83D\uDCC9"} Biggest loser
                  </span>
                  <p className="truncate text-[12px] font-medium text-foreground">
                    {impactSummary.biggestLoser.company.name}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-[13px] font-bold text-danger">
                  {impactSummary.biggestLoser.change}
                </span>
              </div>
            </div>
          </div>

          {/* ── Profile context card ─────────────── */}
          <div className="rounded-lg border border-border-subtle bg-background-sunken px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              {"\uD83D\uDD0D"} Active Profile
            </span>
            <p className="mt-1 text-[13px] font-medium text-foreground">
              {mockProfiles[0].name}
            </p>
            <p className="text-[11px] text-foreground-muted">
              {mockProfiles[0].description} &middot;{" "}
              {mockProfiles[0].activeLeads} leads &middot;{" "}
              {mockProfiles[0].hotLeads} hot
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer with sales quote ──────────────────── */}
      <footer className="mt-8 border-t border-border py-6">
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
            Signal Engine v0.1 &middot; {"\u2696\uFE0F"} Scoring Tuner
          </span>
        </div>
      </footer>
    </div>
  );
}
