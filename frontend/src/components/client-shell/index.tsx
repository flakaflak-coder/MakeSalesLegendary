"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { ChatPanel } from "@/components/chat-panel";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const pathname = usePathname();

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);

  // Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsChatOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Derive current page name for chat context
  const page = pathname === "/" ? "dashboard" : pathname?.replace("/", "") ?? "unknown";

  return (
    <>
      <Sidebar />
      <div className="pl-14 lg:pl-56">
        <Topbar onChatOpen={openChat} />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </div>
      <ChatPanel
        isOpen={isChatOpen}
        onClose={closeChat}
        context={{ page }}
      />
    </>
  );
}
