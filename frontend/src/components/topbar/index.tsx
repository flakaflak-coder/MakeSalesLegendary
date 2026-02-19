"use client";

import { Search, MessageSquare } from "lucide-react";

interface TopbarProps {
  onChatOpen?: () => void;
}

export function Topbar({ onChatOpen }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      {/* Search / Chat trigger */}
      <button
        onClick={onChatOpen}
        className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-card px-3 py-1.5 text-sm text-foreground-muted transition-colors hover:border-border focus-within:border-accent"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="w-40 text-left text-[13px] text-foreground-faint lg:w-64">
          Ask Signal Agent...
        </span>
        <kbd className="ml-2 hidden rounded border border-border-subtle px-1 py-0.5 font-mono text-[10px] text-foreground-faint sm:inline">
          {"\u2318"}K
        </kbd>
      </button>

      {/* Right side */}
      <div className="hidden items-center gap-3 lg:flex">
        <button
          onClick={onChatOpen}
          className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 text-[12px] text-foreground-muted transition-colors hover:border-border hover:text-foreground"
        >
          <MessageSquare className="h-3 w-3" />
          Agent
        </button>
      </div>
    </header>
  );
}
