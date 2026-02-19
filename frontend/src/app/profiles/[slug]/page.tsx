"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Pencil,
  X,
  Plus,
  Trash2,
  Play,
  Loader2,
  Check,
  AlertCircle,
  ChevronDown,
  History,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/mock-data";
import { notFound } from "next/navigation";
import {
  getProfile,
  getHarvestRuns,
  getLeads,
  getScoringConfig,
  getActiveExtractionPrompt,
  getExtractionPrompts,
  createExtractionPrompt,
  updateProfile,
  triggerHarvest,
  triggerEnrichment,
  type ApiProfile,
  type ApiHarvestRun,
  type ApiLeadListItem,
  type ApiScoringConfig,
  type ApiExtractionPrompt,
} from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchTermDraft {
  term: string;
  language: string;
  priority: string;
  category: string;
}

interface ActionFeedback {
  type: "success" | "error";
  message: string;
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: "language" | "priority";
}) {
  const colors: Record<string, string> = {
    // language
    nl: "bg-blue-100 text-blue-700",
    en: "bg-emerald-100 text-emerald-700",
    // priority
    primary: "bg-amber-100 text-amber-700",
    secondary: "bg-stone-200 text-stone-600",
    seniority: "bg-purple-100 text-purple-700",
  };
  const cls =
    colors[label.toLowerCase()] ??
    (variant === "language"
      ? "bg-stone-200 text-stone-600"
      : "bg-stone-200 text-stone-600");

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}

function FeedbackBanner({
  feedback,
  onDismiss,
}: {
  feedback: ActionFeedback;
  onDismiss: () => void;
}) {
  const isError = feedback.type === "error";
  return (
    <div
      className={`mb-4 flex items-center justify-between rounded-md border px-4 py-3 text-[13px] ${
        isError
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-green-300 bg-green-50 text-green-700"
      }`}
    >
      <span className="flex items-center gap-2">
        {isError ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {feedback.message}
      </span>
      <button onClick={onDismiss} className="hover:opacity-70">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProfileDetailPage({
  params,
}: {
  // Route param is numeric profile ID (not slug)
  // TODO: Rename directory from [slug] to [id] to match the actual usage
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  // Route param is numeric profile ID (not slug)
  const profileId = Number(slug);

  // ---- Data state ----
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [leads, setLeads] = useState<ApiLeadListItem[]>([]);
  const [runs, setRuns] = useState<ApiHarvestRun[]>([]);
  const [scoringConfig, setScoringConfig] = useState<ApiScoringConfig | null>(
    null,
  );
  const [activePrompt, setActivePrompt] =
    useState<ApiExtractionPrompt | null>(null);
  const [promptVersionCount, setPromptVersionCount] = useState<number>(0);

  // ---- Loading / error ----
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalFeedback, setGlobalFeedback] =
    useState<ActionFeedback | null>(null);

  // ---- Profile info editing ----
  const [editingInfo, setEditingInfo] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  // ---- Search terms editing ----
  const [editingTerms, setEditingTerms] = useState(false);
  const [draftTerms, setDraftTerms] = useState<SearchTermDraft[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [newTermLang, setNewTermLang] = useState("nl");
  const [newTermPriority, setNewTermPriority] = useState("primary");
  const [savingTerms, setSavingTerms] = useState(false);

  // ---- Extraction prompt editing ----
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [draftSystemPrompt, setDraftSystemPrompt] = useState("");
  const [draftSchema, setDraftSchema] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [draftPromptNotes, setDraftPromptNotes] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  // ---- Action buttons ----
  const [harvestLoading, setHarvestLoading] = useState(false);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  // ---- Data fetching ----
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, leadsRes, runsRes] = await Promise.all([
        getProfile(profileId),
        getLeads({ profileId, limit: 500 }),
        getHarvestRuns(profileId),
      ]);
      setProfile(profileRes);
      setLeads(leadsRes);
      setRuns(runsRes);

      // Load scoring config (may not exist yet)
      try {
        const cfg = await getScoringConfig(profileRes.id);
        setScoringConfig(cfg);
      } catch {
        setScoringConfig(null);
      }

      // Load extraction prompt
      try {
        const prompt = await getActiveExtractionPrompt(profileRes.id);
        setActivePrompt(prompt);
      } catch {
        setActivePrompt(null);
      }

      try {
        const allPrompts = await getExtractionPrompts(profileRes.id);
        setPromptVersionCount(allPrompts.length);
      } catch {
        setPromptVersionCount(0);
      }
    } catch (err) {
      setError(toErrorMessage(err, "Failed to load profile"));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---- Derived ----
  const profileLeads = leads.filter(
    (l) => l.search_profile_id === profile?.id,
  );
  const activeLeads = profileLeads.length;
  const hotLeads = profileLeads.filter((l) => l.status === "hot").length;
  const searchTermCount = profile?.search_terms.length ?? 0;
  const lastRun = runs.length > 0 ? runs[0] : null;

  // ---- Not found ----
  if (!loading && !profile) {
    notFound();
  }

  // ---- Handlers: Profile info ----
  function startEditInfo() {
    if (!profile) return;
    setDraftName(profile.name);
    setDraftDescription(profile.description ?? "");
    setEditingInfo(true);
  }

  function cancelEditInfo() {
    setEditingInfo(false);
  }

  async function saveInfo() {
    if (!profile) return;
    setSavingInfo(true);
    try {
      const updated = await updateProfile(profile.id, {
        name: draftName,
        description: draftDescription,
      });
      setProfile(updated);
      setEditingInfo(false);
      setGlobalFeedback({
        type: "success",
        message: "Profile info updated successfully.",
      });
    } catch (err) {
      setGlobalFeedback({
        type: "error",
        message: toErrorMessage(err, "Failed to update profile info."),
      });
    } finally {
      setSavingInfo(false);
    }
  }

  // ---- Handlers: Search terms ----
  function startEditTerms() {
    if (!profile) return;
    setDraftTerms(
      profile.search_terms.map((t) => ({
        term: t.term,
        language: t.language,
        priority: t.priority,
        category: t.category,
      })),
    );
    setEditingTerms(true);
  }

  function cancelEditTerms() {
    setEditingTerms(false);
    setNewTerm("");
  }

  function addTerm() {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    setDraftTerms((prev) => [
      ...prev,
      {
        term: trimmed,
        language: newTermLang,
        priority: newTermPriority,
        category: newTermPriority,
      },
    ]);
    setNewTerm("");
  }

  function removeTerm(index: number) {
    setDraftTerms((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveTerms() {
    if (!profile) return;
    setSavingTerms(true);
    try {
      const updated = await updateProfile(profile.id, {
        search_terms: draftTerms.map((t) => ({
          term: t.term,
          language: t.language,
          priority: t.priority,
          category: t.category,
        })),
      });
      setProfile(updated);
      setEditingTerms(false);
      setNewTerm("");
      setGlobalFeedback({
        type: "success",
        message: `Search terms updated (${updated.search_terms.length} terms).`,
      });
    } catch (err) {
      setGlobalFeedback({
        type: "error",
        message: toErrorMessage(err, "Failed to update search terms."),
      });
    } finally {
      setSavingTerms(false);
    }
  }

  // ---- Handlers: Extraction prompt ----
  function startEditPrompt() {
    setDraftSystemPrompt(activePrompt?.system_prompt ?? "");
    setDraftSchema(
      activePrompt?.extraction_schema
        ? Object.entries(activePrompt.extraction_schema).map(([key, value]) => ({
            key,
            value,
          }))
        : [],
    );
    setDraftPromptNotes("");
    setEditingPrompt(true);
  }

  function cancelEditPrompt() {
    setEditingPrompt(false);
  }

  function addSchemaField() {
    setDraftSchema((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeSchemaField(index: number) {
    setDraftSchema((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSchemaField(
    index: number,
    field: "key" | "value",
    val: string,
  ) {
    setDraftSchema((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item)),
    );
  }

  async function savePrompt() {
    if (!profile) return;
    setSavingPrompt(true);
    try {
      const schema: Record<string, string> = {};
      for (const entry of draftSchema) {
        const k = entry.key.trim();
        if (k) schema[k] = entry.value;
      }
      const created = await createExtractionPrompt(profile.id, {
        system_prompt: draftSystemPrompt,
        extraction_schema: schema,
        notes: draftPromptNotes || undefined,
      });
      setActivePrompt(created);
      setPromptVersionCount((prev) => prev + 1);
      setEditingPrompt(false);
      setGlobalFeedback({
        type: "success",
        message: `Extraction prompt v${created.version} created successfully.`,
      });
    } catch (err) {
      setGlobalFeedback({
        type: "error",
        message: toErrorMessage(err, "Failed to create extraction prompt."),
      });
    } finally {
      setSavingPrompt(false);
    }
  }

  // ---- Handlers: Actions ----
  async function handleTriggerHarvest() {
    if (!profile) return;
    setHarvestLoading(true);
    try {
      const result = await triggerHarvest(profile.id);
      setGlobalFeedback({
        type: "success",
        message: `Harvest triggered (task ${result.task_id}). Source: ${result.source}.`,
      });
    } catch (err) {
      setGlobalFeedback({
        type: "error",
        message: toErrorMessage(err, "Failed to trigger harvest."),
      });
    } finally {
      setHarvestLoading(false);
    }
  }

  async function handleTriggerEnrichment() {
    if (!profile) return;
    setEnrichmentLoading(true);
    try {
      const result = await triggerEnrichment(profile.id);
      setGlobalFeedback({
        type: "success",
        message: `Enrichment triggered (task ${result.task_id}). Pass: ${result.pass_type}.`,
      });
    } catch (err) {
      setGlobalFeedback({
        type: "error",
        message: toErrorMessage(err, "Failed to trigger enrichment."),
      });
    } finally {
      setEnrichmentLoading(false);
    }
  }

  // ---- Loading skeleton ----
  if (loading) {
    return (
      <div className="px-6 py-6">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-stone-200" />
        <div className="mb-8">
          <div className="mb-2 h-8 w-64 animate-pulse rounded bg-stone-200" />
          <div className="h-4 w-96 animate-pulse rounded bg-stone-200" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-lg border border-border bg-background-card"
            />
          ))}
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="px-6 py-6">
      <Link
        href="/profiles"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-foreground-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Profiles
      </Link>

      {/* Global feedback banner */}
      {globalFeedback && (
        <FeedbackBanner
          feedback={globalFeedback}
          onDismiss={() => setGlobalFeedback(null)}
        />
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Header: Profile Info (editable)                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-8 flex items-start justify-between">
        {editingInfo ? (
          <div className="flex-1 space-y-3 pr-4">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full max-w-md rounded-md border border-amber-300 bg-white px-3 py-2 text-[1.5rem] font-bold tracking-tight text-foreground outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              placeholder="Profile name"
            />
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={2}
              className="w-full max-w-lg resize-none rounded-md border border-amber-300 bg-white px-3 py-2 text-[14px] leading-relaxed text-foreground-secondary outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              placeholder="Description"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveInfo}
                disabled={savingInfo || !draftName.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {savingInfo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </button>
              <button
                onClick={cancelEditInfo}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="group">
            <div className="flex items-center gap-2">
              <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
                {profile?.name ?? "Profile"}
              </h1>
              <button
                onClick={startEditInfo}
                className="rounded p-1 text-foreground-muted opacity-0 transition-all hover:bg-stone-200 hover:text-foreground group-hover:opacity-100"
                title="Edit profile info"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
              {profile?.description ??
                "Configure search terms, scoring weights, and extraction prompts for this profile."}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleTriggerHarvest}
            disabled={harvestLoading}
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-[13px] font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {harvestLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Trigger Harvest
          </button>
          <button
            onClick={handleTriggerEnrichment}
            disabled={enrichmentLoading || !activePrompt}
            title={!activePrompt ? "Configure an extraction prompt first" : undefined}
            className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-stone-50 px-4 py-2 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
          >
            {enrichmentLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Trigger Enrichment
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* -------------------------------------------------------------- */}
        {/* Search Terms (editable)                                        */}
        {/* -------------------------------------------------------------- */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              Search Terms
            </h2>
            {!editingTerms && (
              <button
                onClick={startEditTerms}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>

          {editingTerms ? (
            <div className="space-y-3">
              {/* Term list */}
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {draftTerms.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5"
                  >
                    <span className="flex-1 text-[13px] text-foreground">
                      {t.term}
                    </span>
                    <Badge label={t.language} variant="language" />
                    <Badge label={t.priority} variant="priority" />
                    <button
                      onClick={() => removeTerm(idx)}
                      className="rounded p-0.5 text-stone-400 transition-colors hover:bg-red-100 hover:text-red-600"
                      title="Remove term"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {draftTerms.length === 0 && (
                  <p className="py-4 text-center text-[13px] text-foreground-muted">
                    No search terms. Add one below.
                  </p>
                )}
              </div>

              {/* Add new term */}
              <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-[11px] font-medium text-stone-500">
                      New term
                    </label>
                    <input
                      type="text"
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTerm();
                        }
                      }}
                      placeholder="e.g. crediteurenadministrateur"
                      className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-stone-500">
                      Language
                    </label>
                    <div className="relative">
                      <select
                        value={newTermLang}
                        onChange={(e) => setNewTermLang(e.target.value)}
                        className="appearance-none rounded-md border border-stone-300 bg-white py-1.5 pl-2.5 pr-7 text-[13px] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                      >
                        <option value="nl">NL</option>
                        <option value="en">EN</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-stone-500">
                      Priority
                    </label>
                    <div className="relative">
                      <select
                        value={newTermPriority}
                        onChange={(e) => setNewTermPriority(e.target.value)}
                        className="appearance-none rounded-md border border-stone-300 bg-white py-1.5 pl-2.5 pr-7 text-[13px] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                      >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                        <option value="seniority">Seniority</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400" />
                    </div>
                  </div>
                  <button
                    onClick={addTerm}
                    disabled={!newTerm.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
              </div>

              {/* Save / cancel */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={saveTerms}
                  disabled={savingTerms}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {savingTerms ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save Terms
                </button>
                <button
                  onClick={cancelEditTerms}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
                >
                  Cancel
                </button>
                <span className="ml-auto text-[12px] text-foreground-muted">
                  {draftTerms.length} term{draftTerms.length !== 1 && "s"}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Read-only term list */}
              {searchTermCount > 0 ? (
                <div className="max-h-80 space-y-1.5 overflow-y-auto">
                  {profile?.search_terms.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-1.5"
                    >
                      <span className="flex-1 text-[13px] text-foreground">
                        {t.term}
                      </span>
                      <Badge label={t.language} variant="language" />
                      <Badge label={t.priority} variant="priority" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-[13px] text-foreground-muted">
                  No search terms configured yet.
                </p>
              )}
              <p className="text-[12px] text-foreground-muted">
                {searchTermCount} term{searchTermCount !== 1 && "s"} configured
                for this profile.
              </p>
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Scoring Weights (read-only, links to tuner)                    */}
        {/* -------------------------------------------------------------- */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            Scoring Weights
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
            <div className="h-2 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{
                  width: `${(scoringConfig?.fit_weight ?? 0.6) * 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-foreground-muted">
              Adjust these weights in the{" "}
              <Link
                href="/scoring"
                className="text-amber-700 transition-colors hover:text-amber-800"
              >
                Scoring Tuner
              </Link>
            </p>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Profile Stats                                                  */}
        {/* -------------------------------------------------------------- */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            Statistics
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Active Leads", value: activeLeads },
              { label: "Hot Leads", value: hotLeads },
              { label: "Search Terms", value: searchTermCount },
              {
                label: "Last Harvest",
                value: lastRun?.completed_at
                  ? formatRelativeTime(lastRun.completed_at)
                  : "Never",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-md bg-background-sunken px-3 py-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-faint">
                  {stat.label}
                </span>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Extraction Prompts (editable)                                  */}
        {/* -------------------------------------------------------------- */}
        <div className="rounded-lg border border-border bg-background-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              Extraction Prompts
            </h2>
            <div className="flex items-center gap-2">
              {activePrompt && (
                <span className="flex items-center gap-1 text-[11px] text-foreground-muted">
                  <History className="h-3 w-3" />
                  v{activePrompt.version}
                  {promptVersionCount > 1 &&
                    ` (${promptVersionCount} versions)`}
                </span>
              )}
              {!editingPrompt && (
                <button
                  onClick={startEditPrompt}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
                >
                  <Pencil className="h-3 w-3" />
                  Edit Prompt
                </button>
              )}
            </div>
          </div>

          {editingPrompt ? (
            <div className="space-y-4">
              {/* System prompt */}
              <div>
                <label className="mb-1 block text-[12px] font-medium text-stone-600">
                  System Prompt
                </label>
                <textarea
                  value={draftSystemPrompt}
                  onChange={(e) => setDraftSystemPrompt(e.target.value)}
                  rows={6}
                  className="w-full resize-y rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  placeholder="Enter the system prompt for LLM extraction..."
                />
              </div>

              {/* Extraction schema fields */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[12px] font-medium text-stone-600">
                    Extraction Schema
                  </label>
                  <button
                    onClick={addSchemaField}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    <Plus className="h-3 w-3" />
                    Add Field
                  </button>
                </div>
                <div className="space-y-2">
                  {draftSchema.map((field, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <input
                        type="text"
                        value={field.key}
                        onChange={(e) =>
                          updateSchemaField(idx, "key", e.target.value)
                        }
                        placeholder="field_name"
                        className="w-40 shrink-0 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                      />
                      <input
                        type="text"
                        value={field.value}
                        onChange={(e) =>
                          updateSchemaField(idx, "value", e.target.value)
                        }
                        placeholder="Description of what to extract"
                        className="flex-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                      />
                      <button
                        onClick={() => removeSchemaField(idx)}
                        className="mt-1 rounded p-1 text-stone-400 transition-colors hover:bg-red-100 hover:text-red-600"
                        title="Remove field"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {draftSchema.length === 0 && (
                    <p className="py-3 text-center text-[12px] text-foreground-muted">
                      No extraction fields. Click &quot;Add Field&quot; above.
                    </p>
                  )}
                </div>
              </div>

              {/* Version notes */}
              <div>
                <label className="mb-1 block text-[12px] font-medium text-stone-600">
                  Version Notes (optional)
                </label>
                <input
                  type="text"
                  value={draftPromptNotes}
                  onChange={(e) => setDraftPromptNotes(e.target.value)}
                  placeholder="e.g. Added Unit4 to ERP extraction examples"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
                />
              </div>

              {/* Save / cancel */}
              <div className="flex items-center gap-2">
                <button
                  onClick={savePrompt}
                  disabled={savingPrompt || !draftSystemPrompt.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {savingPrompt ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save as New Version
                </button>
                <button
                  onClick={cancelEditPrompt}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activePrompt ? (
                <>
                  {/* System prompt read-only */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-stone-500">
                      System Prompt
                    </label>
                    <textarea
                      value={activePrompt.system_prompt}
                      readOnly
                      rows={4}
                      className="w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground-secondary"
                    />
                  </div>

                  {/* Extraction schema read-only */}
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-stone-500">
                      Extraction Schema
                    </label>
                    <div className="space-y-1.5">
                      {Object.entries(activePrompt.extraction_schema).map(
                        ([key, description]) => (
                          <div
                            key={key}
                            className="flex items-start gap-2 rounded-md border border-border-subtle px-3 py-2"
                          >
                            <span className="shrink-0 font-mono text-[12px] font-semibold text-amber-700">
                              {key}
                            </span>
                            <span className="text-[12px] text-foreground-secondary">
                              {description}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {activePrompt.notes && (
                    <p className="text-[12px] text-foreground-muted">
                      Notes: {activePrompt.notes}
                    </p>
                  )}
                </>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-[13px] text-foreground-secondary">
                    No extraction prompt configured yet.
                  </p>
                  <button
                    onClick={startEditPrompt}
                    className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-amber-700 transition-colors hover:text-amber-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create first prompt
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
