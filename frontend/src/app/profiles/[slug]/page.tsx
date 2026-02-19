"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { mockProfiles, formatRelativeTime } from "@/lib/mock-data";
import { notFound } from "next/navigation";

export default function ProfileDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const profile = mockProfiles.find((p) => p.slug === slug);

  if (!profile) {
    notFound();
  }

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
            {"\u2699\uFE0F"} {profile.name}
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
                  {profile.searchTermCount}
                </span>{" "}
                search terms configured across primary, secondary, and seniority
                signal categories.
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
                {profile.fitWeight}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-foreground-secondary">
                Timing Weight
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-foreground">
                {profile.timingWeight}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand-200">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${profile.fitWeight * 100}%` }}
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
                value: profile.activeLeads,
                emoji: "\uD83C\uDFAF",
              },
              {
                label: "Hot Leads",
                value: profile.hotLeads,
                emoji: "\uD83D\uDD25",
              },
              {
                label: "Search Terms",
                value: profile.searchTermCount,
                emoji: "\uD83D\uDD0D",
              },
              {
                label: "Last Harvest",
                value: profile.lastHarvestAt
                  ? formatRelativeTime(profile.lastHarvestAt)
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
