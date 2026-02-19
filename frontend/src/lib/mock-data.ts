/**
 * Mock data for all dashboard pages.
 * Structured to mirror the real API response shapes from CLAUDE.md.
 */

// ── Lead statuses ────────────────────────────────────

export type LeadStatus = "hot" | "warm" | "monitor" | "dismissed";
export type FeedbackAction = "contacted" | "meeting" | "converted" | "rejected";

export const statusConfig = {
  hot: {
    label: "Hot",
    emoji: "\uD83D\uDD25",
    color: "text-signal-hot",
    bg: "bg-signal-hot/8",
    dot: "bg-signal-hot",
    border: "border-signal-hot/20",
  },
  warm: {
    label: "Warm",
    emoji: "\u2600\uFE0F",
    color: "text-signal-warm",
    bg: "bg-signal-warm/10",
    dot: "bg-signal-warm",
    border: "border-signal-warm/20",
  },
  monitor: {
    label: "Monitor",
    emoji: "\uD83D\uDC40",
    color: "text-signal-monitor",
    bg: "bg-signal-monitor/10",
    dot: "bg-signal-monitor",
    border: "border-signal-monitor/20",
  },
  dismissed: {
    label: "Dismissed",
    emoji: "\uD83D\uDC4B",
    color: "text-signal-dismissed",
    bg: "bg-signal-dismissed/10",
    dot: "bg-signal-dismissed",
    border: "border-signal-dismissed/20",
  },
} as const;

// ── Companies & Leads ────────────────────────────────

export interface Company {
  id: number;
  name: string;
  kvkNumber: string;
  sbiCodes: string[];
  sector: string;
  employeeRange: string;
  revenueRange: string;
  entityCount: number;
  city: string;
  enrichedAt: string;
}

export interface Vacancy {
  id: number;
  title: string;
  source: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: "active" | "disappeared" | "filled";
  extractedData: {
    erpSystems: string[];
    teamSize: string | null;
    volumeIndicators: string | null;
    automationStatus: string | null;
  };
}

export interface Lead {
  id: number;
  company: Company;
  profileSlug: string;
  fitScore: number;
  timingScore: number;
  compositeScore: number;
  status: LeadStatus;
  vacancyCount: number;
  oldestVacancyDays: number;
  platforms: string[];
  scoringBreakdown: {
    invoiceVolume: { score: number; max: number };
    entityCount: { score: number; max: number };
    employeeCount: { score: number; max: number };
    erpCompatibility: { score: number; max: number; erp: string };
    noExistingP2P: { score: number; max: number };
    sectorFit: { score: number; max: number };
    multiLanguage: { score: number; max: number };
  };
  timingBreakdown: {
    vacancyAge: number;
    multipleVacancies: number;
    repeatedPublication: number;
    relatedVacancies: number;
    managementVacancy: number;
  };
  feedback: FeedbackEntry[];
}

export interface FeedbackEntry {
  id: number;
  action: FeedbackAction;
  reason: string;
  notes: string;
  createdAt: string;
}

export const mockLeads: Lead[] = [
  {
    id: 1,
    company: {
      id: 1,
      name: "Van der Berg Logistics B.V.",
      kvkNumber: "12345678",
      sbiCodes: ["4941", "5229"],
      sector: "Transport & Logistics",
      employeeRange: "200-500",
      revenueRange: "\u20AC50M-100M",
      entityCount: 12,
      city: "Rotterdam",
      enrichedAt: "2026-02-18T14:30:00Z",
    },
    profileSlug: "ap",
    fitScore: 88,
    timingScore: 95,
    compositeScore: 92,
    status: "hot",
    vacancyCount: 3,
    oldestVacancyDays: 67,
    platforms: ["Indeed", "Google Jobs", "Company Website"],
    scoringBreakdown: {
      invoiceVolume: { score: 5, max: 5 },
      entityCount: { score: 5, max: 5 },
      employeeCount: { score: 4, max: 5 },
      erpCompatibility: { score: 5, max: 5, erp: "SAP" },
      noExistingP2P: { score: 3, max: 5 },
      sectorFit: { score: 4, max: 5 },
      multiLanguage: { score: 4, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 3,
      multipleVacancies: 4,
      repeatedPublication: 3,
      relatedVacancies: 2,
      managementVacancy: 2,
    },
    feedback: [
      {
        id: 1,
        action: "contacted",
        reason: "",
        notes: "Spoke with finance director. Very interested. Scheduling demo.",
        createdAt: "2026-02-15T10:00:00Z",
      },
    ],
  },
  {
    id: 2,
    company: {
      id: 2,
      name: "Brinkman & Zonen Holding",
      kvkNumber: "23456789",
      sbiCodes: ["2511", "2562"],
      sector: "Manufacturing",
      employeeRange: "500-1000",
      revenueRange: "\u20AC100M-250M",
      entityCount: 8,
      city: "Eindhoven",
      enrichedAt: "2026-02-17T09:15:00Z",
    },
    profileSlug: "ap",
    fitScore: 82,
    timingScore: 86,
    compositeScore: 84,
    status: "hot",
    vacancyCount: 2,
    oldestVacancyDays: 45,
    platforms: ["Indeed", "LinkedIn"],
    scoringBreakdown: {
      invoiceVolume: { score: 4, max: 5 },
      entityCount: { score: 4, max: 5 },
      employeeCount: { score: 5, max: 5 },
      erpCompatibility: { score: 4, max: 5, erp: "Exact" },
      noExistingP2P: { score: 3, max: 5 },
      sectorFit: { score: 3, max: 5 },
      multiLanguage: { score: 2, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 2,
      multipleVacancies: 3,
      repeatedPublication: 2,
      relatedVacancies: 2,
      managementVacancy: 0,
    },
    feedback: [],
  },
  {
    id: 3,
    company: {
      id: 3,
      name: "Kuiper Bouw Groep",
      kvkNumber: "34567890",
      sbiCodes: ["4120", "4211"],
      sector: "Construction",
      employeeRange: "100-200",
      revenueRange: "\u20AC25M-50M",
      entityCount: 5,
      city: "Utrecht",
      enrichedAt: "2026-02-18T11:00:00Z",
    },
    profileSlug: "ap",
    fitScore: 75,
    timingScore: 80,
    compositeScore: 78,
    status: "warm",
    vacancyCount: 2,
    oldestVacancyDays: 38,
    platforms: ["Indeed", "Google Jobs"],
    scoringBreakdown: {
      invoiceVolume: { score: 3, max: 5 },
      entityCount: { score: 3, max: 5 },
      employeeCount: { score: 3, max: 5 },
      erpCompatibility: { score: 4, max: 5, erp: "AFAS" },
      noExistingP2P: { score: 5, max: 5 },
      sectorFit: { score: 5, max: 5 },
      multiLanguage: { score: 1, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 1,
      multipleVacancies: 3,
      repeatedPublication: 2,
      relatedVacancies: 1,
      managementVacancy: 0,
    },
    feedback: [],
  },
  {
    id: 4,
    company: {
      id: 4,
      name: "TechFlow Solutions B.V.",
      kvkNumber: "45678901",
      sbiCodes: ["6201", "6202"],
      sector: "IT Services",
      employeeRange: "50-100",
      revenueRange: "\u20AC10M-25M",
      entityCount: 3,
      city: "Amsterdam",
      enrichedAt: "2026-02-16T16:45:00Z",
    },
    profileSlug: "ap",
    fitScore: 68,
    timingScore: 72,
    compositeScore: 71,
    status: "warm",
    vacancyCount: 1,
    oldestVacancyDays: 23,
    platforms: ["Google Jobs"],
    scoringBreakdown: {
      invoiceVolume: { score: 2, max: 5 },
      entityCount: { score: 2, max: 5 },
      employeeCount: { score: 2, max: 5 },
      erpCompatibility: { score: 4, max: 5, erp: "AFAS" },
      noExistingP2P: { score: 5, max: 5 },
      sectorFit: { score: 4, max: 5 },
      multiLanguage: { score: 3, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 0,
      multipleVacancies: 0,
      repeatedPublication: 1,
      relatedVacancies: 2,
      managementVacancy: 0,
    },
    feedback: [],
  },
  {
    id: 5,
    company: {
      id: 5,
      name: "De Groot Administratie & Advies",
      kvkNumber: "56789012",
      sbiCodes: ["6920", "6619"],
      sector: "Financial Services",
      employeeRange: "100-200",
      revenueRange: "\u20AC10M-25M",
      entityCount: 4,
      city: "Den Haag",
      enrichedAt: "2026-02-18T08:20:00Z",
    },
    profileSlug: "ap",
    fitScore: 62,
    timingScore: 68,
    compositeScore: 65,
    status: "warm",
    vacancyCount: 2,
    oldestVacancyDays: 34,
    platforms: ["Indeed", "Nationale Vacaturebank"],
    scoringBreakdown: {
      invoiceVolume: { score: 3, max: 5 },
      entityCount: { score: 2, max: 5 },
      employeeCount: { score: 3, max: 5 },
      erpCompatibility: { score: 3, max: 5, erp: "Unit4" },
      noExistingP2P: { score: 3, max: 5 },
      sectorFit: { score: 3, max: 5 },
      multiLanguage: { score: 1, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 1,
      multipleVacancies: 2,
      repeatedPublication: 1,
      relatedVacancies: 1,
      managementVacancy: 0,
    },
    feedback: [
      {
        id: 2,
        action: "rejected",
        reason: "Already uses Basware",
        notes: "They mentioned migrating to Basware last quarter. Not a fit.",
        createdAt: "2026-02-10T14:00:00Z",
      },
    ],
  },
  {
    id: 6,
    company: {
      id: 6,
      name: "Horizon Healthcare Group",
      kvkNumber: "67890123",
      sbiCodes: ["8610", "8690"],
      sector: "Healthcare",
      employeeRange: "1000+",
      revenueRange: "\u20AC250M+",
      entityCount: 20,
      city: "Groningen",
      enrichedAt: "2026-02-17T12:00:00Z",
    },
    profileSlug: "ap",
    fitScore: 55,
    timingScore: 60,
    compositeScore: 58,
    status: "monitor",
    vacancyCount: 1,
    oldestVacancyDays: 12,
    platforms: ["Company Website"],
    scoringBreakdown: {
      invoiceVolume: { score: 5, max: 5 },
      entityCount: { score: 5, max: 5 },
      employeeCount: { score: 5, max: 5 },
      erpCompatibility: { score: 5, max: 5, erp: "Oracle" },
      noExistingP2P: { score: 1, max: 5 },
      sectorFit: { score: 2, max: 5 },
      multiLanguage: { score: 3, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 0,
      multipleVacancies: 0,
      repeatedPublication: 0,
      relatedVacancies: 1,
      managementVacancy: 0,
    },
    feedback: [],
  },
  {
    id: 7,
    company: {
      id: 7,
      name: "Dijkstra Food & Beverage",
      kvkNumber: "78901234",
      sbiCodes: ["1089", "4631"],
      sector: "Food & Beverage",
      employeeRange: "200-500",
      revenueRange: "\u20AC50M-100M",
      entityCount: 6,
      city: "Zwolle",
      enrichedAt: "2026-02-18T15:00:00Z",
    },
    profileSlug: "ap",
    fitScore: 50,
    timingScore: 52,
    compositeScore: 51,
    status: "monitor",
    vacancyCount: 1,
    oldestVacancyDays: 8,
    platforms: ["Indeed"],
    scoringBreakdown: {
      invoiceVolume: { score: 3, max: 5 },
      entityCount: { score: 3, max: 5 },
      employeeCount: { score: 4, max: 5 },
      erpCompatibility: { score: 2, max: 5, erp: "Excel" },
      noExistingP2P: { score: 5, max: 5 },
      sectorFit: { score: 3, max: 5 },
      multiLanguage: { score: 1, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 0,
      multipleVacancies: 0,
      repeatedPublication: 0,
      relatedVacancies: 0,
      managementVacancy: 0,
    },
    feedback: [],
  },
  {
    id: 8,
    company: {
      id: 8,
      name: "Smeets International Trading",
      kvkNumber: "89012345",
      sbiCodes: ["4690", "4639"],
      sector: "Wholesale Trade",
      employeeRange: "50-100",
      revenueRange: "\u20AC25M-50M",
      entityCount: 7,
      city: "Maastricht",
      enrichedAt: "2026-02-18T10:30:00Z",
    },
    profileSlug: "ap",
    fitScore: 79,
    timingScore: 88,
    compositeScore: 83,
    status: "hot",
    vacancyCount: 3,
    oldestVacancyDays: 52,
    platforms: ["Indeed", "Google Jobs", "LinkedIn"],
    scoringBreakdown: {
      invoiceVolume: { score: 4, max: 5 },
      entityCount: { score: 4, max: 5 },
      employeeCount: { score: 2, max: 5 },
      erpCompatibility: { score: 5, max: 5, erp: "SAP" },
      noExistingP2P: { score: 5, max: 5 },
      sectorFit: { score: 3, max: 5 },
      multiLanguage: { score: 5, max: 5 },
    },
    timingBreakdown: {
      vacancyAge: 2,
      multipleVacancies: 4,
      repeatedPublication: 3,
      relatedVacancies: 2,
      managementVacancy: 0,
    },
    feedback: [
      {
        id: 3,
        action: "meeting",
        reason: "",
        notes: "Demo scheduled Feb 25th with CFO and AP team lead.",
        createdAt: "2026-02-18T09:00:00Z",
      },
    ],
  },
];

// ── Vacancies ────────────────────────────────────────

export const mockVacancies: Record<number, Vacancy[]> = {
  1: [
    {
      id: 101,
      title: "Crediteurenadministrateur",
      source: "Indeed",
      firstSeenAt: "2025-12-14T00:00:00Z",
      lastSeenAt: "2026-02-18T00:00:00Z",
      status: "active",
      extractedData: {
        erpSystems: ["SAP"],
        teamSize: "Team van 8 personen",
        volumeIndicators: "25.000+ facturen per jaar",
        automationStatus: "Handmatige verwerking, zoeken naar verbetering",
      },
    },
    {
      id: 102,
      title: "AP Medewerker (Senior)",
      source: "Google Jobs",
      firstSeenAt: "2026-01-05T00:00:00Z",
      lastSeenAt: "2026-02-18T00:00:00Z",
      status: "active",
      extractedData: {
        erpSystems: ["SAP", "Excel"],
        teamSize: null,
        volumeIndicators: "Hoog volume inkoopfacturen",
        automationStatus: null,
      },
    },
    {
      id: 103,
      title: "Teamleider Crediteurenadministratie",
      source: "Company Website",
      firstSeenAt: "2026-01-20T00:00:00Z",
      lastSeenAt: "2026-02-18T00:00:00Z",
      status: "active",
      extractedData: {
        erpSystems: ["SAP"],
        teamSize: "Aansturing team van 6-8 medewerkers",
        volumeIndicators: null,
        automationStatus: "Transitie naar geautomatiseerd P2P proces",
      },
    },
  ],
  8: [
    {
      id: 801,
      title: "Accounts Payable Specialist",
      source: "Indeed",
      firstSeenAt: "2025-12-28T00:00:00Z",
      lastSeenAt: "2026-02-18T00:00:00Z",
      status: "active",
      extractedData: {
        erpSystems: ["SAP"],
        teamSize: "Klein team, 3-4 personen",
        volumeIndicators: "15.000+ facturen per jaar, international",
        automationStatus: "Geen huidige automatisering",
      },
    },
    {
      id: 802,
      title: "Financieel Administratief Medewerker",
      source: "Google Jobs",
      firstSeenAt: "2026-01-10T00:00:00Z",
      lastSeenAt: "2026-02-18T00:00:00Z",
      status: "active",
      extractedData: {
        erpSystems: ["SAP"],
        teamSize: null,
        volumeIndicators: "Multi-currency, meerdere entiteiten",
        automationStatus: null,
      },
    },
    {
      id: 803,
      title: "Purchase-to-Pay Medewerker",
      source: "LinkedIn",
      firstSeenAt: "2026-02-01T00:00:00Z",
      lastSeenAt: "2026-02-18T00:00:00Z",
      status: "active",
      extractedData: {
        erpSystems: ["SAP"],
        teamSize: null,
        volumeIndicators: null,
        automationStatus: "Zoekt verbetering in het P2P proces",
      },
    },
  ],
};

// ── Search Profiles ──────────────────────────────────

export interface SearchProfile {
  id: number;
  name: string;
  slug: string;
  description: string;
  searchTermCount: number;
  activeLeads: number;
  hotLeads: number;
  lastHarvestAt: string;
  fitWeight: number;
  timingWeight: number;
}

export const mockProfiles: SearchProfile[] = [
  {
    id: 1,
    name: "Accounts Payable",
    slug: "ap",
    description: "Crediteurenadministratie & factuurverwerking",
    searchTermCount: 18,
    activeLeads: 47,
    hotLeads: 12,
    lastHarvestAt: "2026-02-18T14:00:00Z",
    fitWeight: 0.6,
    timingWeight: 0.4,
  },
  {
    id: 2,
    name: "Customer Service",
    slug: "cs",
    description: "Klantenservice & support medewerkers",
    searchTermCount: 14,
    activeLeads: 23,
    hotLeads: 5,
    lastHarvestAt: "2026-02-18T14:00:00Z",
    fitWeight: 0.5,
    timingWeight: 0.5,
  },
  {
    id: 3,
    name: "HR Administration",
    slug: "hr",
    description: "Personeelsadministratie & salarisverwerking",
    searchTermCount: 12,
    activeLeads: 0,
    hotLeads: 0,
    lastHarvestAt: "",
    fitWeight: 0.55,
    timingWeight: 0.45,
  },
];

// ── Harvest Runs ─────────────────────────────────────

export interface HarvestRun {
  id: number;
  profileSlug: string;
  profileName: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed" | "partial";
  stats: {
    vacanciesFound: number;
    newVacancies: number;
    companiesMatched: number;
    newCompanies: number;
    errors: number;
  };
  sources: { name: string; status: "ok" | "error" | "skipped"; count: number }[];
}

export const mockHarvestRuns: HarvestRun[] = [
  {
    id: 1,
    profileSlug: "ap",
    profileName: "Accounts Payable",
    startedAt: "2026-02-18T14:00:00Z",
    completedAt: "2026-02-18T14:12:34Z",
    status: "completed",
    stats: {
      vacanciesFound: 142,
      newVacancies: 23,
      companiesMatched: 89,
      newCompanies: 7,
      errors: 0,
    },
    sources: [
      { name: "Google Jobs (SerpAPI)", status: "ok", count: 85 },
      { name: "Indeed.nl", status: "ok", count: 57 },
    ],
  },
  {
    id: 2,
    profileSlug: "cs",
    profileName: "Customer Service",
    startedAt: "2026-02-18T14:15:00Z",
    completedAt: "2026-02-18T14:22:10Z",
    status: "completed",
    stats: {
      vacanciesFound: 98,
      newVacancies: 15,
      companiesMatched: 64,
      newCompanies: 4,
      errors: 0,
    },
    sources: [
      { name: "Google Jobs (SerpAPI)", status: "ok", count: 62 },
      { name: "Indeed.nl", status: "ok", count: 36 },
    ],
  },
  {
    id: 3,
    profileSlug: "ap",
    profileName: "Accounts Payable",
    startedAt: "2026-02-17T14:00:00Z",
    completedAt: "2026-02-17T14:11:45Z",
    status: "partial",
    stats: {
      vacanciesFound: 128,
      newVacancies: 18,
      companiesMatched: 82,
      newCompanies: 5,
      errors: 3,
    },
    sources: [
      { name: "Google Jobs (SerpAPI)", status: "ok", count: 80 },
      { name: "Indeed.nl", status: "error", count: 48 },
    ],
  },
  {
    id: 4,
    profileSlug: "ap",
    profileName: "Accounts Payable",
    startedAt: "2026-02-16T14:00:00Z",
    completedAt: "2026-02-16T14:10:22Z",
    status: "completed",
    stats: {
      vacanciesFound: 135,
      newVacancies: 12,
      companiesMatched: 85,
      newCompanies: 3,
      errors: 0,
    },
    sources: [
      { name: "Google Jobs (SerpAPI)", status: "ok", count: 82 },
      { name: "Indeed.nl", status: "ok", count: 53 },
    ],
  },
];

// ── Analytics ────────────────────────────────────────

export const mockAnalytics = {
  conversionFunnel: {
    harvested: 847,
    enriched: 612,
    qualified: 234,
    contacted: 89,
    meeting: 34,
    converted: 15,
  },
  scoringAccuracy: [
    { month: "Sep", predicted: 72, actual: 68 },
    { month: "Oct", predicted: 75, actual: 71 },
    { month: "Nov", predicted: 78, actual: 76 },
    { month: "Dec", predicted: 80, actual: 79 },
    { month: "Jan", predicted: 82, actual: 81 },
    { month: "Feb", predicted: 85, actual: 83 },
  ],
  topSearchTerms: [
    { term: "crediteurenadministrateur", leads: 34, conversions: 8, rate: 23.5 },
    { term: "accounts payable medewerker", leads: 28, conversions: 5, rate: 17.9 },
    { term: "AP medewerker", leads: 22, conversions: 4, rate: 18.2 },
    { term: "factuurverwerking", leads: 18, conversions: 2, rate: 11.1 },
    { term: "crediteurenadministratie", leads: 15, conversions: 3, rate: 20.0 },
    { term: "purchase-to-pay", leads: 12, conversions: 1, rate: 8.3 },
    { term: "P2P medewerker", leads: 9, conversions: 1, rate: 11.1 },
    { term: "inkoopfacturen", leads: 8, conversions: 0, rate: 0 },
  ],
  weeklyNewLeads: [
    { week: "W3", hot: 2, warm: 5, monitor: 8 },
    { week: "W4", hot: 3, warm: 7, monitor: 6 },
    { week: "W5", hot: 1, warm: 4, monitor: 9 },
    { week: "W6", hot: 4, warm: 8, monitor: 5 },
    { week: "W7", hot: 3, warm: 6, monitor: 7 },
    { week: "W8", hot: 5, warm: 9, monitor: 4 },
  ],
};

// ── Helpers ──────────────────────────────────────────

export function formatDate(iso: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeTime(iso: string): string {
  if (!iso) return "Never";
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD = Math.floor(diffH / 24);

  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return formatDate(iso);
}

export function scoreColor(score: number): string {
  if (score >= 80) return "text-signal-hot";
  if (score >= 60) return "text-signal-warm";
  return "text-signal-monitor";
}

/** Note: duplicates scoreBarColor in components/score-bar. Canonical version lives there. */
export function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-signal-hot";
  if (score >= 60) return "bg-signal-warm";
  return "bg-signal-monitor";
}
