"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/mock-data";
import { salesGifs } from "@/lib/sales-gifs";
import {
  Plus,
  Target,
  Clock,
  Settings,
  ChevronRight,
  Zap,
  X,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  createProfile,
  getHarvestRuns,
  getLeads,
  getProfiles,
  getScoringConfig,
  triggerHarvest,
  type ApiHarvestRun,
  type ApiLeadListItem,
  type ApiProfile,
  type ApiScoringConfig,
} from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

/* ── Types for the New Profile form ───────────────────────── */

interface SearchTermEntry {
  id: string;
  term: string;
  language: "nl" | "en";
  priority: "primary" | "secondary" | "seniority_signals";
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [leads, setLeads] = useState<ApiLeadListItem[]>([]);
  const [runs, setRuns] = useState<ApiHarvestRun[]>([]);
  const [scoringConfigs, setScoringConfigs] = useState<Record<number, ApiScoringConfig | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<number | null>(null);

  /* ── New Profile Modal state ─────────────────────────────── */
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [formDescription, setFormDescription] = useState("");
  const [formTerms, setFormTerms] = useState<SearchTermEntry[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback(() => {
    setFormName("");
    setFormSlug("");
    setSlugTouched(false);
    setFormDescription("");
    setFormTerms([]);
    setFormError(null);
    setFormSubmitting(false);
  }, []);

  function openModal() {
    resetForm();
    setModalOpen(true);
  }

  function closeModal() {
    if (formSubmitting) return;
    setModalOpen(false);
  }

  function handleNameChange(value: string) {
    setFormName(value);
    if (!slugTouched) {
      setFormSlug(generateSlug(value));
    }
  }

  function addSearchTerm() {
    setFormTerms((prev) => [
      ...prev,
      { id: crypto.randomUUID(), term: "", language: "nl", priority: "primary" },
    ]);
  }

  function removeSearchTerm(id: string) {
    setFormTerms((prev) => prev.filter((t) => t.id !== id));
  }

  function updateSearchTerm(id: string, field: keyof SearchTermEntry, value: string) {
    setFormTerms((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    const trimmedSlug = formSlug.trim();

    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }
    if (!trimmedSlug) {
      setFormError("Slug is required.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      setFormError("Slug must be lowercase alphanumeric with hyphens only (e.g. \"accounts-payable\").");
      return;
    }

    const validTerms = formTerms.filter((t) => t.term.trim() !== "");

    setFormSubmitting(true);
    try {
      await createProfile({
        name: trimmedName,
        slug: trimmedSlug,
        description: formDescription.trim() || undefined,
        search_terms: validTerms.length > 0
          ? validTerms.map((t) => ({
              term: t.term.trim(),
              language: t.language,
              priority: t.priority,
            }))
          : undefined,
      });

      setModalOpen(false);

      // Refresh profiles list
      const refreshed = await getProfiles();
      setProfiles(refreshed);

      // Fetch scoring configs for any new profiles
      const configEntries = await Promise.all(
        refreshed.map(async (profile) => {
          try {
            const cfg = await getScoringConfig(profile.id);
            return [profile.id, cfg] as const;
          } catch {
            return [profile.id, null] as const;
          }
        })
      );
      setScoringConfigs(Object.fromEntries(configEntries));
    } catch (err) {
      setFormError(toErrorMessage(err, "Failed to create profile."));
    } finally {
      setFormSubmitting(false);
    }
  }

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

        const configEntries = await Promise.all(
          profilesRes.map(async (profile) => {
            try {
              const cfg = await getScoringConfig(profile.id);
              return [profile.id, cfg] as const;
            } catch {
              return [profile.id, null] as const;
            }
          })
        );
        if (cancelled) return;
        setScoringConfigs(Object.fromEntries(configEntries));
      } catch (err) {
        if (cancelled) return;
        setError(toErrorMessage(err, "Failed to load profiles"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const leadsByProfile = useMemo(() => {
    const map = new Map<number, ApiLeadListItem[]>();
    for (const lead of leads) {
      const list = map.get(lead.search_profile_id) ?? [];
      list.push(lead);
      map.set(lead.search_profile_id, list);
    }
    return map;
  }, [leads]);

  const lastRunByProfile = useMemo(() => {
    const map = new Map<number, ApiHarvestRun>();
    for (const run of runs) {
      if (!map.has(run.profile_id)) map.set(run.profile_id, run);
    }
    return map;
  }, [runs]);

  async function handleTriggerHarvest(profileId: number) {
    setTriggering(profileId);
    try {
      await triggerHarvest(profileId);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to trigger harvest"));
    } finally {
      setTriggering(null);
    }
  }

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

        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" />
          New Profile
        </button>
      </section>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* ── Profile Cards Grid ──────────────────────────── */}
      <section className="mb-10 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {loading && profiles.length === 0 ? (
          <div className="text-[13px] text-foreground-muted">Loading profiles...</div>
        ) : (
          profiles.map((profile) => {
            const profileLeads = leadsByProfile.get(profile.id) ?? [];
            const activeLeads = profileLeads.length;
            const hotLeads = profileLeads.filter((l) => l.status === "hot").length;
            const searchTermCount = profile.search_terms.length;
            const lastRun = lastRunByProfile.get(profile.id);
            const hasLeads = activeLeads > 0;

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

                  <p className="mb-4 text-[13px] leading-relaxed text-foreground-secondary">
                    {profile.description}
                  </p>

                  {hasLeads ? (
                    <div className="mb-3 flex items-center gap-4 text-[13px]">
                      <span className="flex items-center gap-1.5 text-foreground-secondary">
                        <Target className="h-3.5 w-3.5 text-foreground-faint" />
                        {"\uD83C\uDFAF"}{" "}
                        <span className="font-medium text-foreground">
                          {activeLeads}
                        </span>{" "}
                        leads
                      </span>
                      <span className="text-foreground-faint">{"\u00B7"}</span>
                      <span className="flex items-center gap-1 text-foreground-secondary">
                        {"\uD83D\uDD25"}{" "}
                        <span className="font-medium text-signal-hot">
                          {hotLeads}
                        </span>{" "}
                        hot
                      </span>
                      <span className="text-foreground-faint">{"\u00B7"}</span>
                      <span className="flex items-center gap-1 text-foreground-secondary">
                        {"\uD83D\uDD11"}{" "}
                        <span className="font-medium text-foreground">
                          {searchTermCount}
                        </span>{" "}
                        terms
                      </span>
                    </div>
                  ) : (
                    <div className="mb-3 flex items-center gap-4 text-[13px]">
                      <span className="flex items-center gap-1 text-foreground-secondary">
                        {"\uD83D\uDD11"}{" "}
                        <span className="font-medium text-foreground">
                          {searchTermCount}
                        </span>{" "}
                        terms configured
                      </span>
                    </div>
                  )}

                  <div className="mb-4 text-[12px] text-foreground-muted">
                    {lastRun?.completed_at ? (
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-foreground-faint" />
                        {"\uD83D\uDE9C"} Last harvest:{" "}
                        <span className="font-medium text-foreground-secondary">
                          {formatRelativeTime(lastRun.completed_at)}
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-foreground-muted">
                        <Clock className="h-3 w-3 text-foreground-faint" />
                        Never harvested
                      </span>
                    )}
                  </div>

                  {!hasLeads && (
                    <div className="mb-4 rounded-md bg-accent-subtle px-3 py-2">
                      <p className="text-[12px] leading-relaxed text-accent">
                        This profile is ready. Hit harvest to start finding leads.{" "}
                        {"\uD83D\uDE80"}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-border-subtle pt-4">
                    <Link
                      href={`/profiles/${profile.id}`}
                      className="group/link flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Configure
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5" />
                    </Link>

                    <button
                      onClick={() => handleTriggerHarvest(profile.id)}
                      disabled={triggering === profile.id}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active",
                        triggering === profile.id && "opacity-70 cursor-not-allowed"
                      )}
                    >
                      <Zap className="h-3 w-3 text-foreground-muted" />
                      {triggering === profile.id ? "Triggering..." : "Trigger Harvest"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* ── Scoring Weights Overview ────────────────────── */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {"\u2696\uFE0F"} Current Scoring Weights
        </h2>

        <div className="overflow-hidden rounded-lg border border-border bg-background-card">
          {profiles.map((profile, index) => {
            const config = scoringConfigs[profile.id];
            const fitWeight = config?.fit_weight ?? 0.6;
            const timingWeight = config?.timing_weight ?? 0.4;
            const fitPercent = Math.round(fitWeight * 100);
            const timingPercent = Math.round(timingWeight * 100);

            return (
              <div
                key={profile.id}
                className={cn(
                  "flex items-center gap-5 px-5 py-4",
                  index < profiles.length - 1 && "border-b border-border-subtle"
                )}
              >
                <div className="w-44 shrink-0">
                  <span className="text-[13px] font-medium text-foreground">
                    {profile.name}
                  </span>
                  <span className="ml-2 font-mono text-[11px] text-foreground-muted">
                    {profile.slug}
                  </span>
                </div>

                <div className="flex flex-1 items-center gap-3">
                  <span className="w-16 shrink-0 text-right text-[12px] font-medium tabular-nums text-accent">
                    Fit: {fitWeight.toFixed(2)}
                  </span>

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

                  <span className="w-20 shrink-0 text-[12px] font-medium tabular-nums text-signal-warm">
                    Timing: {timingWeight.toFixed(2)}
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
                terms tell the harvester what to look for and the scoring config
                tells the engine how to rank leads.
              </p>
              <p className="text-[13px] text-foreground-muted">
                Add or adjust terms for each profile and keep weights aligned with
                what converts best.
              </p>
            </div>
            <div className="hidden overflow-hidden rounded-lg border border-border-subtle lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={salesGifs.hustle[0]}
                alt="Profiles"
                className="h-28 w-40 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── New Profile Modal ─────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-profile-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-sand-950/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Modal panel */}
          <div
            ref={modalRef}
            className="relative z-10 mx-4 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-background-card shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
              <h2
                id="new-profile-title"
                className="text-[16px] font-semibold text-foreground"
              >
                New Search Profile
              </h2>
              <button
                onClick={closeModal}
                disabled={formSubmitting}
                className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-hover hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateProfile}>
              <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 py-5">
                {/* Error display */}
                {formError && (
                  <div className="rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
                    {formError}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label
                    htmlFor="profile-name"
                    className="mb-1.5 block text-[13px] font-medium text-foreground"
                  >
                    Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Accounts Payable"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-faint transition-colors focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label
                    htmlFor="profile-slug"
                    className="mb-1.5 block text-[13px] font-medium text-foreground"
                  >
                    Slug <span className="text-danger">*</span>
                  </label>
                  <input
                    id="profile-slug"
                    type="text"
                    required
                    value={formSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setFormSlug(e.target.value);
                    }}
                    placeholder="e.g. accounts-payable"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-foreground-faint transition-colors focus:border-accent focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    Auto-generated from the name. Used in URLs and API calls.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="profile-description"
                    className="mb-1.5 block text-[13px] font-medium text-foreground"
                  >
                    Description
                  </label>
                  <textarea
                    id="profile-description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="What digital employee type does this profile target?"
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-faint transition-colors focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Search Terms */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-[13px] font-medium text-foreground">
                      Search Terms
                    </label>
                    <button
                      type="button"
                      onClick={addSearchTerm}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground-secondary transition-colors hover:bg-background-hover"
                    >
                      <Plus className="h-3 w-3" />
                      Add Term
                    </button>
                  </div>

                  {formTerms.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border-subtle px-4 py-3 text-center text-[12px] text-foreground-muted">
                      No search terms yet. Add terms to tell the harvester what to look for.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {formTerms.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-sunken p-2"
                        >
                          {/* Term text */}
                          <input
                            type="text"
                            value={entry.term}
                            onChange={(e) =>
                              updateSearchTerm(entry.id, "term", e.target.value)
                            }
                            placeholder="Search term..."
                            className="min-w-0 flex-1 rounded border border-border bg-background-card px-2 py-1.5 text-[12px] text-foreground placeholder:text-foreground-faint focus:border-accent focus:outline-none"
                          />

                          {/* Language */}
                          <select
                            value={entry.language}
                            onChange={(e) =>
                              updateSearchTerm(entry.id, "language", e.target.value)
                            }
                            className="rounded border border-border bg-background-card px-2 py-1.5 text-[12px] text-foreground focus:border-accent focus:outline-none"
                          >
                            <option value="nl">NL</option>
                            <option value="en">EN</option>
                          </select>

                          {/* Priority */}
                          <select
                            value={entry.priority}
                            onChange={(e) =>
                              updateSearchTerm(entry.id, "priority", e.target.value)
                            }
                            className="rounded border border-border bg-background-card px-2 py-1.5 text-[12px] text-foreground focus:border-accent focus:outline-none"
                          >
                            <option value="primary">Primary</option>
                            <option value="secondary">Secondary</option>
                            <option value="seniority_signals">Seniority</option>
                          </select>

                          {/* Remove */}
                          <button
                            type="button"
                            onClick={() => removeSearchTerm(entry.id)}
                            className="shrink-0 rounded p-1 text-foreground-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={formSubmitting}
                  className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className={cn(
                    "flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]",
                    formSubmitting && "cursor-not-allowed opacity-70"
                  )}
                >
                  {formSubmitting ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-foreground/30 border-t-accent-foreground" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Profile
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
