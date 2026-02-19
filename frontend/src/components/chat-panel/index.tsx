"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Zap, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendChatMessage, type ChatResponse, type ChatToolCall } from "@/lib/api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: ChatToolCall[];
  loading?: boolean;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context?: { profileId?: number; leadId?: number; page?: string };
}

function ToolCallCard({ call }: { call: ChatToolCall }) {
  const data = call.data;
  if (!data) return null;

  // Render leads as a compact list
  const leads = data.leads as Array<Record<string, unknown>> | undefined;
  if (leads && leads.length > 0) {
    return (
      <div className="mt-2 rounded-md border border-border-subtle bg-background-sunken p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
          {leads.length} lead{leads.length !== 1 ? "s" : ""}
        </div>
        <div className="space-y-1.5">
          {leads.slice(0, 8).map((lead, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  lead.status === "hot"
                    ? "bg-signal-hot"
                    : lead.status === "warm"
                      ? "bg-signal-warm"
                      : "bg-signal-monitor"
                )}
              />
              <span className="flex-1 truncate font-medium text-foreground">
                {String(lead.company_name ?? "Unknown")}
              </span>
              <span className="tabular-nums text-foreground-muted">
                {String(lead.composite_score ?? "—")}
              </span>
              <span className="text-foreground-faint">{String(lead.status ?? "")}</span>
            </div>
          ))}
          {leads.length > 8 && (
            <div className="text-[11px] text-foreground-faint">
              +{leads.length - 8} more
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render stats/overview as key-value pairs
  if (data.total !== undefined || data.profiles !== undefined) {
    return (
      <div className="mt-2 rounded-md border border-border-subtle bg-background-sunken p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
          {Object.entries(data).map(([key, value]) => {
            if (typeof value === "object" && value !== null) return null;
            return (
              <div key={key} className="flex items-baseline justify-between gap-2">
                <span className="text-foreground-muted">{key.replace(/_/g, " ")}</span>
                <span className="font-medium tabular-nums text-foreground">{String(value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Render action confirmations
  if (data.status === "queued") {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-success/20 bg-success/5 px-3 py-2 text-[12px] text-success">
        <Zap className="h-3 w-3" />
        <span>
          {call.tool.replace(/_/g, " ")} — queued
          {data.profile_id ? ` (profile ${data.profile_id})` : ""}
        </span>
      </div>
    );
  }

  // Render errors
  if (data.error) {
    return (
      <div className="mt-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12px] text-danger">
        {String(data.error)}
      </div>
    );
  }

  return null;
}

export function ChatPanel({ isOpen, onClose, context }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Escape key closes panel
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
    };
    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setSending(true);

    try {
      const response: ChatResponse = await sendChatMessage(trimmed, context);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                ...m,
                text: response.reply,
                toolCalls: response.tool_calls,
                loading: false,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMsg.id
            ? {
                ...m,
                text:
                  err instanceof Error
                    ? `Error: ${err.message}`
                    : "Something went wrong.",
                loading: false,
              }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, context]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-sand-950/20"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-background shadow-xl transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent" />
            <span className="text-[13px] font-semibold text-foreground">
              Signal Agent
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-background-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center pt-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                <Zap className="h-4 w-4 text-accent" />
              </div>
              <p className="text-[13px] font-medium text-foreground-secondary">
                Signal Engine Agent
              </p>
              <p className="mt-1 max-w-[260px] text-[12px] leading-relaxed text-foreground-faint">
                Ask me about your leads, trigger a harvest, or check your analytics. NL &amp; EN.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-1.5">
                {[
                  "Hoeveel hot leads?",
                  "Harvest AP profiel",
                  "Show analytics overview",
                  "Search Randstad",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="rounded-full border border-border-subtle bg-background-card px-3 py-1 text-[11px] text-foreground-muted transition-colors hover:border-border hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2",
                    msg.role === "user"
                      ? "bg-accent text-accent-foreground"
                      : "bg-background-card border border-border-subtle"
                  )}
                >
                  {msg.loading ? (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="h-3 w-3 animate-spin text-foreground-muted" />
                      <span className="text-[12px] text-foreground-muted">
                        Thinking...
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                        {msg.text}
                      </p>
                      {msg.toolCalls?.map((call, i) => (
                        <ToolCallCard key={i} call={call} />
                      ))}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-card px-3 py-2 focus-within:border-accent">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask the Signal Agent..."
              className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-all duration-100",
                input.trim() && !sending
                  ? "bg-accent text-accent-foreground hover:bg-accent-hover active:scale-95"
                  : "text-foreground-faint"
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-0.5">
            <span className="text-[10px] text-foreground-faint">
              Press Enter to send, Esc to close
            </span>
            <kbd className="rounded border border-border-subtle px-1 py-0.5 font-mono text-[9px] text-foreground-faint">
              {"\u2318"}K
            </kbd>
          </div>
        </div>
      </div>
    </>
  );
}
