export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN;

export class ApiError extends Error {
  status: number;
  body: string | null;

  constructor(message: string, status: number, body: string | null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => null);
    throw new ApiError(`Request failed: ${res.status}`, res.status, body);
  }

  if (res.status === 204) {
    return null as T;
  }

  return res.json() as Promise<T>;
}

export interface ApiLeadListItem {
  id: number;
  company_id: number;
  search_profile_id: number;
  fit_score: number;
  timing_score: number;
  composite_score: number;
  status: string;
  vacancy_count: number;
  oldest_vacancy_days: number;
  platform_count: number;
  company_name: string | null;
  company_city: string | null;
  company_sector: string | null;
  company_employee_range: string | null;
  company_erp: string | null;
  company_enrichment_status: string | null;
  company_extraction_quality: number | null;
}

export interface ApiLeadDetail {
  id: number;
  company_id: number;
  search_profile_id: number;
  fit_score: number;
  timing_score: number;
  composite_score: number;
  status: string;
  scoring_breakdown: Record<string, unknown> | null;
  vacancy_count: number;
  oldest_vacancy_days: number;
  platform_count: number;
  scored_at: string | null;
  created_at: string;
  company: {
    id: number;
    name: string;
    kvk_number: string | null;
    sbi_codes: string[] | null;
    employee_range: string | null;
    revenue_range: string | null;
    entity_count: number | null;
    enrichment_data: Record<string, unknown> | null;
    enrichment_status: string | null;
    extraction_quality: number | null;
  } | null;
  vacancies: Array<{
    id: number;
    job_title: string;
    source: string;
    location: string | null;
    status: string;
    first_seen_at: string | null;
    last_seen_at: string | null;
    extracted_data: Record<string, unknown> | null;
  }>;
  feedback: Array<{
    id: number;
    action: string;
    reason: string | null;
    notes: string | null;
    created_at: string | null;
  }>;
}

export interface ApiLeadStats {
  total: number;
  average_score: number;
  by_status: Record<string, number>;
}

export interface ApiHarvestRun {
  id: number;
  profile_id: number;
  source: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  vacancies_found: number;
  vacancies_new: number;
  error_message: string | null;
}

export interface ApiAnalyticsFunnel {
  profile_id: number | null;
  funnel: Array<{ stage: string; count: number }>;
}

export interface ApiAnalyticsOverview {
  profiles: number;
  companies: number;
  vacancies: { total: number; by_status: Record<string, number> };
  leads: {
    total: number;
    by_status: Record<string, number>;
    average_composite_score: number;
    average_fit_score: number;
    average_timing_score: number;
  };
  feedback: Record<string, number>;
}

export interface ApiAnalyticsScoringAccuracy {
  profile_id: number | null;
  converted: {
    count: number;
    avg_composite_score: number;
    avg_fit_score: number;
    avg_timing_score: number;
  };
  rejected: {
    count: number;
    avg_composite_score: number;
    avg_fit_score: number;
    avg_timing_score: number;
  };
  score_distribution: Record<string, number>;
}

export interface ApiAnalyticsTermPerformance {
  profile_id: number;
  terms: Array<{
    term_id: number;
    term: string;
    language: string;
    priority: string;
    vacancy_count: number;
    lead_count: number;
    avg_lead_score: number;
  }>;
}

export interface ApiHarvestSummary {
  profile_id: number | null;
  runs: Array<{
    id: number;
    profile_id: number;
    source: string;
    status: string;
    vacancies_found: number;
    vacancies_new: number;
    started_at: string | null;
    completed_at: string | null;
  }>;
  summary: {
    total_runs: number;
    completed: number;
    failed: number;
    total_vacancies_found: number;
    total_vacancies_new: number;
  };
}

export interface ApiProfile {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  search_terms: Array<{
    id: number;
    term: string;
    language: string;
    priority: string;
    category: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface ApiEventLog {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ApiScoringConfig {
  id: number;
  profile_id: number;
  version: number;
  is_active: boolean;
  fit_weight: number;
  timing_weight: number;
  fit_criteria: Record<string, unknown>;
  timing_signals: Record<string, number>;
  score_thresholds: Record<string, number>;
}

export async function getLeads(params?: {
  profileId?: number;
  status?: string;
  minScore?: number;
  maxScore?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}): Promise<ApiLeadListItem[]> {
  const qs = new URLSearchParams();
  if (params?.profileId) qs.set("profile_id", String(params.profileId));
  if (params?.status) qs.set("status", params.status);
  if (params?.minScore !== undefined) qs.set("min_score", String(params.minScore));
  if (params?.maxScore !== undefined) qs.set("max_score", String(params.maxScore));
  if (params?.sortBy) qs.set("sort_by", params.sortBy);
  if (params?.sortOrder) qs.set("sort_order", params.sortOrder);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));

  const suffix = qs.toString();
  return apiFetch<ApiLeadListItem[]>(`/api/leads${suffix ? `?${suffix}` : ""}`);
}

export async function getLead(id: number): Promise<ApiLeadDetail> {
  return apiFetch<ApiLeadDetail>(`/api/leads/${id}`);
}

export async function getLeadStats(profileId?: number): Promise<ApiLeadStats> {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return apiFetch<ApiLeadStats>(`/api/leads/stats${qs}`);
}

export async function getHarvestRuns(profileId?: number): Promise<ApiHarvestRun[]> {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return apiFetch<ApiHarvestRun[]>(`/api/harvest/runs${qs}`);
}

export async function triggerHarvest(
  profileId: number,
  source: string = "google_jobs"
): Promise<{ status: string; task_id: string; profile_id: number; source: string }> {
  return apiFetch(`/api/harvest/trigger`, {
    method: "POST",
    body: JSON.stringify({ profile_id: profileId, source }),
  });
}

export async function getAnalyticsFunnel(
  profileId?: number
): Promise<ApiAnalyticsFunnel> {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return apiFetch<ApiAnalyticsFunnel>(`/api/analytics/funnel${qs}`);
}

export async function getAnalyticsOverview(): Promise<ApiAnalyticsOverview> {
  return apiFetch<ApiAnalyticsOverview>(`/api/analytics/overview`);
}

export async function getAnalyticsScoringAccuracy(
  profileId?: number
): Promise<ApiAnalyticsScoringAccuracy> {
  const qs = profileId ? `?profile_id=${profileId}` : "";
  return apiFetch<ApiAnalyticsScoringAccuracy>(`/api/analytics/scoring-accuracy${qs}`);
}

export async function getAnalyticsTermPerformance(
  profileId: number
): Promise<ApiAnalyticsTermPerformance> {
  const qs = `?profile_id=${profileId}`;
  return apiFetch<ApiAnalyticsTermPerformance>(`/api/analytics/term-performance${qs}`);
}

export async function getHarvestSummary(
  profileId?: number,
  lastRuns: number = 10
): Promise<ApiHarvestSummary> {
  const qs = new URLSearchParams();
  if (profileId) qs.set("profile_id", String(profileId));
  qs.set("last_n_runs", String(lastRuns));
  return apiFetch<ApiHarvestSummary>(`/api/analytics/harvest-summary?${qs}`);
}

export async function getProfiles(): Promise<ApiProfile[]> {
  return apiFetch<ApiProfile[]>(`/api/profiles`);
}

export async function getEvents(params?: {
  eventType?: string;
  entityType?: string;
  entityId?: number;
  limit?: number;
  offset?: number;
}): Promise<ApiEventLog[]> {
  const qs = new URLSearchParams();
  if (params?.eventType) qs.set("event_type", params.eventType);
  if (params?.entityType) qs.set("entity_type", params.entityType);
  if (params?.entityId != null) qs.set("entity_id", String(params.entityId));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const suffix = qs.toString();
  return apiFetch<ApiEventLog[]>(`/api/events${suffix ? `?${suffix}` : ""}`);
}

export async function getScoringConfig(
  profileId: number
): Promise<ApiScoringConfig> {
  return apiFetch<ApiScoringConfig>(`/api/scoring/${profileId}`);
}

export async function updateScoringConfig(
  profileId: number,
  payload: {
    fit_weight?: number;
    timing_weight?: number;
    fit_criteria?: Record<string, unknown>;
    timing_signals?: Record<string, number>;
    score_thresholds?: Record<string, number>;
  }
): Promise<ApiScoringConfig> {
  return apiFetch<ApiScoringConfig>(`/api/scoring/${profileId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function runScoring(profileId: number): Promise<{
  status: string;
  task_id?: string;
  profile_id: number;
  scoring_config_version?: number;
}> {
  return apiFetch(`/api/scoring/${profileId}/run`, { method: "POST" });
}

export async function updateLeadStatus(
  leadId: number,
  status: string
): Promise<{ id: number; status: string }> {
  const qs = new URLSearchParams({ status }).toString();
  return apiFetch(`/api/leads/${leadId}/status?${qs}`, { method: "PUT" });
}

export async function createLeadFeedback(
  leadId: number,
  payload: { action: string; reason?: string; notes?: string }
): Promise<{ id: number; lead_id: number; action: string; reason: string | null; notes: string | null; created_at: string }>
{
  return apiFetch(`/api/leads/${leadId}/feedback`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Profile CRUD ---

export async function getProfile(id: number): Promise<ApiProfile> {
  return apiFetch<ApiProfile>(`/api/profiles/${id}`);
}

export async function createProfile(payload: {
  name: string;
  slug: string;
  description?: string;
  search_terms?: Array<{ term: string; language?: string; priority?: string; category?: string }>;
}): Promise<ApiProfile> {
  return apiFetch<ApiProfile>(`/api/profiles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProfile(
  id: number,
  payload: {
    name?: string;
    slug?: string;
    description?: string;
    search_terms?: Array<{ term: string; language?: string; priority?: string; category?: string }>;
  }
): Promise<ApiProfile> {
  return apiFetch<ApiProfile>(`/api/profiles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// --- Extraction Prompts ---

export interface ApiExtractionPrompt {
  id: number;
  profile_id: number;
  version: number;
  system_prompt: string;
  extraction_schema: Record<string, string>;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export async function getExtractionPrompts(
  profileId: number
): Promise<ApiExtractionPrompt[]> {
  return apiFetch<ApiExtractionPrompt[]>(
    `/api/enrichment/profiles/${profileId}/prompts`
  );
}

export async function getActiveExtractionPrompt(
  profileId: number
): Promise<ApiExtractionPrompt> {
  return apiFetch<ApiExtractionPrompt>(
    `/api/enrichment/profiles/${profileId}/prompts/active`
  );
}

export async function createExtractionPrompt(
  profileId: number,
  payload: {
    system_prompt: string;
    extraction_schema: Record<string, string>;
    notes?: string;
  }
): Promise<ApiExtractionPrompt> {
  return apiFetch<ApiExtractionPrompt>(
    `/api/enrichment/profiles/${profileId}/prompts`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

// --- Chat ---

export interface ChatToolCall {
  tool: string;
  data: Record<string, unknown> | null;
}

export interface ChatResponse {
  reply: string;
  tool_calls: ChatToolCall[];
}

export async function sendChatMessage(
  message: string,
  context?: { profileId?: number; leadId?: number; page?: string }
): Promise<ChatResponse> {
  const body: Record<string, unknown> = { message };
  if (context) {
    body.context = {
      profile_id: context.profileId ?? null,
      lead_id: context.leadId ?? null,
      page: context.page ?? null,
    };
  }
  return apiFetch<ChatResponse>(`/api/chat`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// --- Enrichment ---

export async function triggerEnrichment(
  profileId: number,
  passType: string = "both"
): Promise<{ status: string; task_id: string; profile_id: number; pass_type: string }> {
  return apiFetch(`/api/enrichment/trigger`, {
    method: "POST",
    body: JSON.stringify({ profile_id: profileId, pass_type: passType }),
  });
}
