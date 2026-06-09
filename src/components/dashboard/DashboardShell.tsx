/**
 * DashboardShell — server component layout wrapper.
 *
 * Two-column layout: fixed TopNav at 64px, fixed Sidebar at 240px on md+,
 * scrollable main content area.
 *
 * Wraps all children in NotificationContextProvider so TopNav and
 * NotificationFeed share the same unreadCount state without prop drilling.
 *
 * Props:
 *   children  — main content (route page)
 *   sidebar   — <Sidebar /> rendered by dashboard layout
 *   topnav    — <TopNav /> rendered by dashboard layout
 */

import React from "react";
import { NotificationContextProvider } from "@/components/dashboard/NotificationContext";

interface DashboardShellProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  topnav: React.ReactNode;
}

export function DashboardShell({
  children,
  sidebar,
  topnav,
}: DashboardShellProps) {
  return (
    <NotificationContextProvider>
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* TopNav — fixed 64px at top */}
        <div className="h-16 bg-forest text-white fixed top-0 left-0 right-0 z-30 border-b border-white/10">
          {topnav}
        </div>

        {/* Below nav: sidebar + main */}
        <div className="flex flex-row flex-1 pt-16">
          {/* Sidebar — fixed 240px on md+, hidden on mobile */}
          <aside className="w-[240px] min-h-screen bg-forest fixed left-0 top-16 bottom-0 z-20 hidden md:flex flex-col">
            {sidebar}
          </aside>

          {/* Main content area */}
          <main className="flex-1 min-w-0 ml-0 md:ml-[240px] px-6 py-8 md:px-8 bg-gray-50">
            {children}
          </main>
        </div>
      </div>
    </NotificationContextProvider>
  );
}
