"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

const navigation = [
  {
    label: "Dashboard",
    href: "/",
    emoji: "\uD83D\uDCCA",
  },
  {
    label: "Leads",
    href: "/leads",
    emoji: "\uD83C\uDFAF",
  },
  {
    label: "Profiles",
    href: "/profiles",
    emoji: "\uD83D\uDD0D",
  },
  {
    label: "Scoring",
    href: "/scoring",
    emoji: "\u2696\uFE0F",
  },
  {
    label: "Analytics",
    href: "/analytics",
    emoji: "\uD83D\uDCC8",
  },
  {
    label: "Harvest",
    href: "/harvest",
    emoji: "\uD83D\uDE9C",
  },
];

const bottomNavigation = [
  {
    label: "Settings",
    href: "/settings",
    emoji: "\u2699\uFE0F",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-14 lg:w-56 flex-col bg-sidebar-bg text-sidebar-fg">
      {/* Logo area */}
      <Link
        href="/"
        className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3.5 lg:px-5"
      >
        <span className="text-lg">{"\uD83D\uDD25"}</span>
        <div className="hidden lg:flex flex-col">
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-fg-active">
            Signal Engine
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-sidebar-fg-muted">
            Make Sales Legendary
          </span>
        </div>
      </Link>

      {/* Main navigation */}
      <nav className="flex-1 px-2 lg:px-3 py-4">
        <div className="space-y-0.5">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname?.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-active text-sidebar-fg-active"
                    : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-active"
                )}
              >
                <span className="text-sm">{item.emoji}</span>
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border px-2 lg:px-3 py-3">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-sidebar-fg-active"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-active"
              )}
            >
              <span className="text-sm">{item.emoji}</span>
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}

        {/* Profile / branding */}
        <div className="mt-3 flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
            F
          </div>
          <div className="hidden lg:flex flex-col">
            <span className="text-[12px] font-medium text-sidebar-fg-active">
              Freeday
            </span>
            <span className="text-[10px] text-sidebar-fg-muted">
              AP Profile
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
