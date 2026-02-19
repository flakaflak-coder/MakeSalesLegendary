"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { formatRelativeTime } from "@/lib/mock-data";
import { notFound } from "next/navigation";
import {
  getHarvestRuns,
  getLeads,
  getProfiles,
  getScoringConfig,
  type ApiHarvestRun,
  type ApiLeadListItem,
  type ApiProfile,
  type ApiScoringConfig,
} from "@/lib/api";

export default function ProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [leads, setLeads] = useState<ApiLeadListItem[]>([]);
  const [runs, setRuns] = useState<ApiHarvestRun[]>([]);
  const [scoringConfig, setScoringConfig] = useState<ApiScoringConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [profilesRes, leadsRes, runsRes] = await Promise.all([
          getProfiles(),
          getLeads({ limit: 500 }),
          getHarvestRuns(),
        ]);
        if (cancelled) return;
        setProfiles(profilesRes);
        setLeads(leadsRes);
        setRuns(runsRes);

        const profile = profilesRes.find((p) => p.slug === slug);
        if (profile) {
          try {
            const cfg = await getScoringConfig(profile.id);
            if (!cancelled) setScoringConfig(cfg);
          } catch {
            if (!cancelled) setScoringConfig(null);
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const profile = profiles.find((p) => p.slug === slug);

  if (!loading && !profile) {
    notFound();
  }

  const profileLeads = leads.filter((l) => l.search_profile_id === profile?.id);
  const activeLeads = profileLeads.length;
  const hotLeads = profileLeads.filter((l) => l.status === "hot").length;
  const searchTermCount = profile?.search_terms.length ?? 0;
  const lastRun = runs.find((r) => r.profile_id === profile?.id);

  return (
    <div className="px-6 py-6">
      <Link
        href="/profiles"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-foreground-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Profiles
      </Link>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
            {"\u2699\uFE0F"} {profile?.name ?? "Profile"}
          </h1>
          <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
            Configure search terms, scoring weights, and extraction prompts for
            this profile.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover active:scale-[0.97]">
          <Save className="h-3.5 w-3.5" />
          Save Changes
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Search Terms */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            {"\uD83D\uDD0D"} Search Terms
          </h2>
          <div className="space-y-3">
            <div>
              <h3 className="mb-2 text-[13px] font-medium text-foreground">
                Term Configuration
              </h3>
              <p className="text-[13px] text-foreground-secondary">
                This profile has{" "}
                <span className="font-semibold text-foreground">
                  {searchTermCount}
                </span>{" "}
                search terms configured.
              </p>
              <p className="mt-2 text-[12px] text-foreground-muted">
                Edit terms in the YAML config or via the API to add new keywords
                for this digital employee type.
              </p>
            </div>
          </div>
        </div>

        {/* Scoring Weights */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            {"\u2696\uFE0F"} Scoring Weights
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground-secondary">
                Fit Weight
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {scoringConfig?.fit_weight?.toFixed(2) ?? "--"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground-secondary">
                Timing Weight
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {scoringConfig?.timing_weight?.toFixed(2) ?? "--"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand-200">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(scoringConfig?.fit_weight ?? 0.6) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-foreground-muted">
              Adjust these weights in the{" "}
              <Link
                href="/scoring"
                className="text-accent transition-colors hover:text-accent-hover"
              >
                Scoring Tuner
              </Link>
            </p>
          </div>
        </div>

        {/* Profile Stats */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            {"\uD83D\uDCCA"} Statistics
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Active Leads",
                value: activeLeads,
                emoji: "\uD83C\uDFAF",
              },
              {
                label: "Hot Leads",
                value: hotLeads,
                emoji: "\uD83D\uDD25",
              },
              {
                label: "Search Terms",
                value: searchTermCount,
                emoji: "\uD83D\uDD0D",
              },
              {
                label: "Last Harvest",
                value: lastRun?.completed_at
                  ? formatRelativeTime(lastRun.completed_at)
                  : "Never",
                emoji: "\uD83D\uDE9C",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-md bg-background-sunken px-3 py-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-faint">
                  {stat.emoji} {stat.label}
                </span>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Extraction Prompts */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            {"\uD83E\uDDEA"} Extraction Prompts
          </h2>
          <p className="text-[13px] leading-relaxed text-foreground-secondary">
            These prompts tell the LLM what to extract from vacancy texts for
            this profile. Edit them to improve data quality.
          </p>
          <div className="mt-4 space-y-2">
            {[
              "ERP Systems",
              "Team Size",
              "Volume Indicators",
              "Automation Status",
            ].map((prompt) => (
              <div
                key={prompt}
                className="flex items-center justify-between rounded-md border border-border-subtle px-3 py-2"
              >
                <span className="text-[13px] text-foreground">{prompt}</span>
                <span className="text-[11px] text-foreground-muted">
                  Configured
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
