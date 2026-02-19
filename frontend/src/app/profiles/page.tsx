"use client";

import { cn } from "@/lib/utils";
import { mockProfiles, formatRelativeTime } from "@/lib/mock-data";
import { salesGifs } from "@/lib/sales-gifs";
import {
  UserSearch,
  Plus,
  Target,
  Clock,
  Hash,
  Settings,
  ChevronRight,
  Zap,
} from "lucide-react";
import Link from "next/link";

export default function ProfilesPage() {
  return (
    <div className="px-6 py-6">
      {/* ── Page Header ─────────────────────────────────── */}
      <section className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
            {"\uD83D\uDD0D"} Search Profiles
          </h1>
          <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
            Configure what you&apos;re hunting for. Each profile is a digital
            employee type.
          </p>
        </div>

        <button className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]">
          <Plus className="h-4 w-4" />
          New Profile
        </button>
      </section>

      {/* ── Profile Cards Grid ──────────────────────────── */}
      <section className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {mockProfiles.map((profile) => {
          const hasLeads = profile.activeLeads > 0;
          const hasHarvested = profile.lastHarvestAt !== "";

          return (
            <div
              key={profile.id}
              className={cn(
                "group relative overflow-hidden rounded-lg border bg-background-card transition-colors hover:border-border-strong",
                hasLeads
                  ? "border-l-[3px] border-l-accent border-t-border border-r-border border-b-border"
                  : "border-l-[3px] border-l-sand-300 border-t-border border-r-border border-b-border"
              )}
            >
              <div className="p-5">
                {/* Profile name + slug */}
                <div className="mb-1 flex items-center gap-3">
                  <h2 className="text-[16px] font-semibold text-foreground">
                    {profile.name}
                  </h2>
                  <span className="rounded border border-border-subtle px-1.5 py-0.5 font-mono text-[11px] text-foreground-muted">
                    {profile.slug}
                  </span>
                  {!hasLeads && (
                    <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Ready to launch
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="mb-4 text-[13px] leading-relaxed text-foreground-secondary">
                  {profile.description}
                </p>

                {/* Stats row */}
                {hasLeads ? (
                  <div className="mb-3 flex items-center gap-4 text-[13px]">
                    <span className="flex items-center gap-1.5 text-foreground-secondary">
                      <Target className="h-3.5 w-3.5 text-foreground-faint" />
                      {"\uD83C\uDFAF"}{" "}
                      <span className="font-medium text-foreground">
                        {profile.activeLeads}
                      </span>{" "}
                      leads
                    </span>
                    <span className="text-foreground-faint">{"\u00B7"}</span>
                    <span className="flex items-center gap-1 text-foreground-secondary">
                      {"\uD83D\uDD25"}{" "}
                      <span className="font-medium text-signal-hot">
                        {profile.hotLeads}
                      </span>{" "}
                      hot
                    </span>
                    <span className="text-foreground-faint">{"\u00B7"}</span>
                    <span className="flex items-center gap-1 text-foreground-secondary">
                      {"\uD83D\uDD11"}{" "}
                      <span className="font-medium text-foreground">
                        {profile.searchTermCount}
                      </span>{" "}
                      terms
                    </span>
                  </div>
                ) : (
                  <div className="mb-3 flex items-center gap-4 text-[13px]">
                    <span className="flex items-center gap-1 text-foreground-secondary">
                      {"\uD83D\uDD11"}{" "}
                      <span className="font-medium text-foreground">
                        {profile.searchTermCount}
                      </span>{" "}
                      terms configured
                    </span>
                  </div>
                )}

                {/* Last harvest */}
                <div className="mb-4 text-[12px] text-foreground-muted">
                  {hasHarvested ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-foreground-faint" />
                      {"\uD83D\uDE9C"} Last harvest:{" "}
                      <span className="font-medium text-foreground-secondary">
                        {formatRelativeTime(profile.lastHarvestAt)}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-foreground-muted">
                      <Clock className="h-3 w-3 text-foreground-faint" />
                      Never harvested
                    </span>
                  )}
                </div>

                {/* Motivational message for empty profiles */}
                {!hasLeads && (
                  <div className="mb-4 rounded-md bg-accent-subtle px-3 py-2">
                    <p className="text-[12px] leading-relaxed text-accent">
                      This profile is ready. Hit harvest to start finding leads.{" "}
                      {"\uD83D\uDE80"}
                    </p>
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex items-center justify-between border-t border-border-subtle pt-4">
                  <Link
                    href={`/profiles/${profile.slug}`}
                    className="group/link flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configure
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5" />
                  </Link>

                  <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active">
                    <Zap className="h-3 w-3 text-foreground-muted" />
                    Trigger Harvest
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Scoring Weights Overview ────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\u2696\uFE0F"} Current Scoring Weights
        </h2>

        <div className="overflow-hidden rounded-lg border border-border bg-background-card">
          {mockProfiles.map((profile, index) => {
            const fitPercent = Math.round(profile.fitWeight * 100);
            const timingPercent = Math.round(profile.timingWeight * 100);

            return (
              <div
                key={profile.id}
                className={cn(
                  "flex items-center gap-5 px-5 py-4",
                  index < mockProfiles.length - 1 &&
                    "border-b border-border-subtle"
                )}
              >
                {/* Profile name */}
                <div className="w-44 shrink-0">
                  <span className="text-[13px] font-medium text-foreground">
                    {profile.name}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-foreground-muted">
                    {profile.slug}
                  </span>
                </div>

                {/* Weight bar */}
                <div className="flex flex-1 items-center gap-3">
                  {/* Fit label */}
                  <span className="w-16 shrink-0 text-right text-[12px] font-medium tabular-nums text-accent">
                    Fit: {profile.fitWeight}
                  </span>

                  {/* Bar visualization */}
                  <div className="flex h-6 flex-1 overflow-hidden rounded-md">
                    <div
                      className="flex items-center justify-center bg-accent/20 text-[10px] font-semibold text-accent"
                      style={{ width: `${fitPercent}%` }}
                    >
                      {fitPercent}%
                    </div>
                    <div
                      className="flex items-center justify-center bg-signal-warm/20 text-[10px] font-semibold text-signal-warm"
                      style={{ width: `${timingPercent}%` }}
                    >
                      {timingPercent}%
                    </div>
                  </div>

                  {/* Timing label */}
                  <span className="w-20 shrink-0 text-[12px] font-medium tabular-nums text-signal-warm">
                    Timing: {profile.timingWeight}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How Profiles Work Explainer ─────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\uD83D\uDCA1"} How Profiles Work
        </h2>

        <div className="overflow-hidden rounded-lg border border-border bg-background-card">
          <div className="flex items-start gap-6 p-6">
            <div className="flex-1">
              <p className="mb-3 text-[14px] leading-relaxed text-foreground-secondary">
                Each profile defines what your digital employee can replace. The
                search terms find vacancies, the scoring weights prioritize
                leads. Add a new profile whenever Freeday launches a new digital
                employee type.
              </p>
              <div className="flex flex-col gap-3 text-[12px] text-foreground-muted lg:flex-row lg:items-start lg:gap-6">
                <div className="flex items-center gap-2">
                  <UserSearch className="h-4 w-4 text-foreground-faint" />
                  <span>
                    <span className="font-medium text-foreground-secondary">
                      Search Terms
                    </span>{" "}
                    &mdash; what vacancies to find
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-foreground-faint" />
                  <span>
                    <span className="font-medium text-foreground-secondary">
                      Scoring Weights
                    </span>{" "}
                    &mdash; how to rank leads
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-foreground-faint" />
                  <span>
                    <span className="font-medium text-foreground-secondary">
                      Extraction Prompts
                    </span>{" "}
                    &mdash; what to mine from vacancy text
                  </span>
                </div>
              </div>
            </div>

            {/* Hustle GIF */}
            <div className="hidden shrink-0 lg:block">
              <div className="relative overflow-hidden rounded-lg border border-border-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={salesGifs.hustle[0]}
                  alt="Hustle mode"
                  className="h-24 w-36 object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sand-900/80 to-transparent px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                    Stay Hustling
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
