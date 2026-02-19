"use client";

import { Search } from "lucide-react";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-card px-3 py-1.5 text-sm text-foreground-muted transition-colors hover:border-border focus-within:border-accent">
        <Search className="h-3.5 w-3.5" />
        <input
          type="text"
          placeholder="Search leads, companies..."
          className="w-40 lg:w-64 bg-transparent text-[13px] text-foreground placeholder:text-foreground-faint focus:outline-none"
        />
      </div>

      {/* Right side */}
      <div className="hidden lg:flex items-center gap-4">
        <span className="text-xs text-foreground-muted">
          {"\uD83D\uDCCA"} 847 leads tracked
        </span>
        <div className="h-4 w-px bg-border" />
        <span className="text-xs text-foreground-muted">
          Last harvest: 2h ago {"\u2705"}
        </span>
      </div>
    </header>
  );
}
