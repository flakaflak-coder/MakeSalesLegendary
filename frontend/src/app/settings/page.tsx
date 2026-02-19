"use client";

import { useEffect, useState } from "react";
import {
  Key,
  Bell,
  Clock,
  Database,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { salesGifs, salesQuotes } from "@/lib/sales-gifs";
import { getAnalyticsOverview, type ApiAnalyticsOverview } from "@/lib/api";

/* -- Types ------------------------------------------------ */

interface ApiKeyField {
  label: string;
  envKey: string;
  configured: boolean;
}

type ScheduleOption = "6h" | "12h" | "24h" | "manual";
type LlmModel = "claude-3-5-sonnet" | "claude-3-5-haiku" | "claude-3-opus";

/* -- Page ------------------------------------------------- */

export default function SettingsPage() {
  const [schedule, setSchedule] = useState<ScheduleOption>("6h");
  const [notifications, setNotifications] = useState({
    hotLeads: true,
    harvestErrors: true,
    weeklySummary: false,
  });
  const [notificationEmail, setNotificationEmail] = useState(
    "sales@freeday.ai"
  );
  const [llmModel, setLlmModel] = useState<LlmModel>("claude-3-5-sonnet");
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [overview, setOverview] = useState<ApiAnalyticsOverview | null>(null);
  const [dbLoading, setDbLoading] = useState(true);

  useEffect(() => {
    getAnalyticsOverview()
      .then(setOverview)
      .catch((err) => console.error("Failed to load database stats:", err))
      .finally(() => setDbLoading(false));
  }, []);

  const apiKeys: ApiKeyField[] = [
    { label: "SerpAPI Key", envKey: "SERPAPI_KEY", configured: true },
    { label: "KvK API Key", envKey: "KVK_API_KEY", configured: true },
    { label: "Anthropic API Key", envKey: "ANTHROPIC_API_KEY", configured: true },
    { label: "Company.info Key", envKey: "COMPANY_INFO_KEY", configured: false },
  ];

  const scheduleOptions: { value: ScheduleOption; label: string }[] = [
    { value: "6h", label: "Every 6 hours" },
    { value: "12h", label: "Every 12 hours" },
    { value: "24h", label: "Every 24 hours" },
    { value: "manual", label: "Manual only" },
  ];

  const llmModels: { value: LlmModel; label: string }[] = [
    { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku", label: "Claude 3.5 Haiku" },
    { value: "claude-3-opus", label: "Claude 3 Opus" },
  ];

  const notificationItems = [
    {
      key: "hotLeads" as const,
      label: "Notify on new hot leads",
      ariaLabel: "Enable hot lead alerts",
      description: "Get alerted when a lead reaches hot status",
    },
    {
      key: "harvestErrors" as const,
      label: "Notify on harvest errors",
      ariaLabel: "Enable harvest error alerts",
      description: "Know immediately when a scraper fails",
    },
    {
      key: "weeklySummary" as const,
      label: "Weekly summary email",
      ariaLabel: "Enable weekly summary email",
      description: "Receive a digest of leads and performance",
    },
  ];

  const quote = salesQuotes[4]; // "The secret of getting ahead is getting started."

  const handleTestConnection = () => {
    setConnectionStatus("testing");
    setTimeout(() => {
      setConnectionStatus("success");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    }, 1500);
  };

  return (
    <div className="px-6 py-6">
      {/* -- Header ---------------------------------------- */}
      <section className="mb-8">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
          {"\u2699\uFE0F"} Settings
        </h1>
        <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
          Configure your Signal Engine. API keys, schedules, and preferences.
        </p>
      </section>

      <div className="space-y-6">
        {/* -- API Keys ------------------------------------ */}
        <div className="rounded-lg border border-border bg-background-card px-6 py-5">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
              <Key className="h-4 w-4 text-accent" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              {"\uD83D\uDD11"} API Keys
            </h2>
          </div>

          <div className="space-y-4">
            {apiKeys.map((key) => (
              <div key={key.envKey} className="flex items-center gap-4">
                <label
                  htmlFor={`api-key-${key.envKey}`}
                  className="w-40 shrink-0 text-[13px] font-medium text-foreground-secondary"
                >
                  {key.label}
                </label>
                <div className="relative flex-1">
                  <input
                    id={`api-key-${key.envKey}`}
                    type="password"
                    defaultValue={key.configured ? "sk-xxxxxxxxxxxxxxxx" : ""}
                    placeholder={`Enter ${key.label}...`}
                    className="w-full border-0 border-b border-border bg-transparent py-1.5 pr-8 text-[13px] text-foreground placeholder:text-foreground-faint focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="w-28 shrink-0">
                  {key.configured ? (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success">
                      {"\u2705"} Configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning">
                      {"\u26A0\uFE0F"} Missing
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-[11px] text-foreground-muted">
              Keys are stored securely and never exposed in the frontend.
            </p>
            <button className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-all duration-100 hover:bg-accent-hover active:scale-[0.97]">
              Save Keys
            </button>
          </div>
        </div>

        {/* -- Harvest Schedule ----------------------------- */}
        <div className="rounded-lg border border-border bg-background-card px-6 py-5">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
              <Clock className="h-4 w-4 text-accent" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              {"\u23F0"} Harvest Schedule
            </h2>
          </div>

          <div
            role="radiogroup"
            aria-label="Harvest schedule"
            className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background-sunken p-1"
          >
            {scheduleOptions.map((option) => (
              <button
                key={option.value}
                role="radio"
                aria-checked={schedule === option.value}
                onClick={() => setSchedule(option.value)}
                className={cn(
                  "flex-1 rounded-[5px] px-3 py-2 text-[12px] font-medium transition-colors",
                  schedule === option.value
                    ? "bg-foreground text-background"
                    : "text-foreground-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[12px] text-foreground-muted">
            {"\uD83D\uDCC5"} Next run at:{" "}
            <span className="font-medium text-foreground-secondary">
              Feb 19, 2026 18:00
            </span>
          </p>
        </div>

        {/* -- Notifications -------------------------------- */}
        <div className="rounded-lg border border-border bg-background-card px-6 py-5">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
              <Bell className="h-4 w-4 text-accent" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              {"\uD83D\uDD14"} Notifications
            </h2>
          </div>

          <div className="space-y-4">
            {notificationItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="text-[13px] font-medium text-foreground">
                    {item.label}
                  </span>
                  <p className="text-[11px] text-foreground-muted">
                    {item.description}
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={notifications[item.key]}
                  aria-label={item.ariaLabel}
                  onClick={() =>
                    setNotifications((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key],
                    }))
                  }
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                    notifications[item.key]
                      ? "bg-accent"
                      : "bg-sand-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
                      notifications[item.key]
                        ? "translate-x-[18px]"
                        : "translate-x-[3px]"
                    )}
                  />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-4 border-t border-border-subtle pt-4">
              <label
                htmlFor="notification-email"
                className="w-40 shrink-0 text-[13px] font-medium text-foreground-secondary"
              >
                Notification email
              </label>
              <input
                id="notification-email"
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                className="flex-1 border-0 border-b border-border bg-transparent py-1.5 text-[13px] text-foreground placeholder:text-foreground-faint focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* -- Database ------------------------------------- */}
        <div className="rounded-lg border border-border bg-background-card px-6 py-5">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
              <Database className="h-4 w-4 text-accent" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              {"\uD83D\uDDC4\uFE0F"} Database
            </h2>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border-subtle bg-background-sunken px-4 py-3">
              <span className="text-[13px] text-foreground-secondary">
                {"\uD83C\uDFE2"}{" "}
                <span className="font-semibold text-foreground">
                  {dbLoading ? "\u2014" : (overview?.companies ?? 0).toLocaleString()}
                </span>{" "}
                companies
              </span>
            </div>
            <div className="rounded-md border border-border-subtle bg-background-sunken px-4 py-3">
              <span className="text-[13px] text-foreground-secondary">
                {"\uD83D\uDCCB"}{" "}
                <span className="font-semibold text-foreground">
                  {dbLoading ? "\u2014" : (overview?.vacancies.total ?? 0).toLocaleString()}
                </span>{" "}
                vacancies
              </span>
            </div>
            <div className="rounded-md border border-border-subtle bg-background-sunken px-4 py-3">
              <span className="text-[13px] text-foreground-secondary">
                {"\uD83C\uDFAF"}{" "}
                <span className="font-semibold text-foreground">
                  {dbLoading ? "\u2014" : (overview?.leads.total ?? 0).toLocaleString()}
                </span>{" "}
                active leads
              </span>
            </div>
          </div>

          <p className="mb-4 text-[12px] text-foreground-muted">
            Last migration:{" "}
            <span className="font-medium text-foreground-secondary">
              Feb 15, 2026
            </span>
          </p>

          <div className="flex items-center gap-3">
            <button className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active">
              {"\uD83D\uDD04"} Run Migrations
            </button>
            <button className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-background-hover active:bg-background-active">
              {"\uD83D\uDCE4"} Export All Data
            </button>
          </div>
        </div>

        {/* -- LLM Configuration --------------------------- */}
        <div className="rounded-lg border border-border bg-background-card px-6 py-5">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
              <Zap className="h-4 w-4 text-accent" />
            </span>
            <h2 className="text-[15px] font-semibold text-foreground">
              {"\uD83E\uDD16"} LLM Configuration
            </h2>
          </div>

          <div className="space-y-5">
            {/* Model selector */}
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                Model
              </label>
              <div
                role="radiogroup"
                aria-label="LLM model"
                className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background-sunken p-1"
              >
                {llmModels.map((model) => (
                  <button
                    key={model.value}
                    role="radio"
                    aria-checked={llmModel === model.value}
                    onClick={() => setLlmModel(model.value)}
                    className={cn(
                      "flex-1 rounded-[5px] px-3 py-2 text-[12px] font-medium transition-colors",
                      llmModel === model.value
                        ? "bg-foreground text-background"
                        : "text-foreground-muted hover:text-foreground"
                    )}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature slider */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="temperature-slider"
                  className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted"
                >
                  Temperature
                </label>
                <span className="text-[13px] font-mono font-medium tabular-nums text-foreground">
                  {temperature.toFixed(1)}
                </span>
              </div>
              <input
                id="temperature-slider"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="mt-1 flex justify-between text-[10px] text-foreground-faint">
                <span>Precise (0.0)</span>
                <span>Creative (1.0)</span>
              </div>
            </div>

            {/* Max tokens */}
            <div className="flex items-center gap-4">
              <label
                htmlFor="max-tokens-input"
                className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted"
              >
                Max Tokens
              </label>
              <input
                id="max-tokens-input"
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 0)}
                className="w-32 border-0 border-b border-border bg-transparent py-1.5 text-[13px] font-mono tabular-nums text-foreground focus:border-accent focus:outline-none"
              />
            </div>

            {/* Test connection */}
            <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
              <button
                onClick={handleTestConnection}
                disabled={connectionStatus === "testing"}
                className={cn(
                  "rounded-md border border-border px-4 py-2 text-[13px] font-medium transition-colors",
                  connectionStatus === "testing"
                    ? "cursor-not-allowed text-foreground-muted"
                    : "text-foreground hover:bg-background-hover active:bg-background-active"
                )}
              >
                {connectionStatus === "testing" ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground-muted border-t-transparent" />
                    Testing...
                  </span>
                ) : (
                  <>{"\u26A1"} Test Connection</>
                )}
              </button>
              {connectionStatus === "success" && (
                <span className="text-[12px] font-medium text-success">
                  {"\u2705"} Connection successful &mdash; Claude is ready
                </span>
              )}
              {connectionStatus === "error" && (
                <span className="text-[12px] font-medium text-danger">
                  {"\u274C"} Connection failed &mdash; check your API key
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -- Footer GIF ------------------------------------ */}
      <footer className="mt-8 border-t border-border pt-6">
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
          <div className="relative overflow-hidden rounded-lg border border-border-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={salesGifs.motivation[0]}
              alt="You got this"
              className="h-20 w-36 object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sand-900/80 to-transparent px-2.5 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                Ship it {"\uD83D\uDE80"}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
