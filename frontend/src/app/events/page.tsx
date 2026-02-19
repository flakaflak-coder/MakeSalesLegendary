"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { formatDate, formatRelativeTime } from "@/lib/mock-data";
import { getEvents, type ApiEventLog } from "@/lib/api";

const eventTypes = [
  "harvest.triggered",
  "enrichment.triggered",
  "scoring.config_updated",
  "scoring.run_triggered",
  "lead.status_updated",
  "lead.feedback_submitted",
];

const entityTypes = ["profile", "lead"];

export default function EventsPage() {
  const [events, setEvents] = useState<ApiEventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventType, setEventType] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getEvents({
          eventType: eventType || undefined,
          entityType: entityType || undefined,
          limit: 200,
        });
        if (cancelled) return;
        setEvents(data);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [eventType, entityType]);

  const filtered = useMemo(() => {
    if (!search) return events;
    const q = search.toLowerCase();
    return events.filter((evt) => {
      const metadata = JSON.stringify(evt.metadata ?? {}).toLowerCase();
      return (
        evt.event_type.toLowerCase().includes(q) ||
        evt.entity_type.toLowerCase().includes(q) ||
        String(evt.entity_id ?? "").includes(q) ||
        metadata.includes(q)
      );
    });
  }, [events, search]);

  return (
    <div className="px-6 py-6">
      <section className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
              {"\uD83D\uDCCB"} Event Log
            </h1>
            <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
              Audit trail of harvests, enrichments, scoring changes, and sales actions.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background-card px-3 py-1.5">
            <Filter className="h-3.5 w-3.5 text-foreground-faint" />
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="bg-transparent text-[12px] font-medium text-foreground focus:outline-none"
            >
              <option value="">All events</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-background-card px-3 py-1.5">
            <Filter className="h-3.5 w-3.5 text-foreground-faint" />
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="bg-transparent text-[12px] font-medium text-foreground focus:outline-none"
            >
              <option value="">All entities</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-card px-3 py-1.5 transition-colors hover:border-border focus-within:border-accent">
          <Search className="h-3.5 w-3.5 text-foreground-faint" />
          <input
            type="text"
            placeholder="Search event log..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 bg-transparent text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none"
          />
        </div>
      </section>

      <section>
        <div className="overflow-x-auto rounded-lg border border-border bg-background-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Event
                </th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Entity
                </th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Metadata
                </th>
                <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
                  Time
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-5 py-4 text-[13px] text-foreground-muted" colSpan={4}>
                    Loading events...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-[13px] text-foreground-muted" colSpan={4}>
                    No events found.
                  </td>
                </tr>
              ) : (
                filtered.map((evt) => (
                  <tr key={evt.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                        {evt.event_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                      <span className="font-medium text-foreground">
                        {evt.entity_type}
                      </span>
                      {evt.entity_id != null && (
                        <span className="ml-2 font-mono text-[11px] text-foreground-faint">
                          #{evt.entity_id}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[12px] text-foreground-secondary">
                      <code className="rounded bg-sand-50 px-2 py-1 text-[11px] text-foreground-muted">
                        {Object.keys(evt.metadata ?? {}).length > 0
                          ? JSON.stringify(evt.metadata)
                          : "-"}
                      </code>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-foreground-muted">
                      <div className="flex flex-col">
                        <span>{formatRelativeTime(evt.created_at)}</span>
                        <span className="text-[10px] text-foreground-faint">
                          {formatDate(evt.created_at)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
