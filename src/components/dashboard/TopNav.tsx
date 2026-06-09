"use client";

/**
 * TopNav — client component.
 *
 * Fixed 64px height (set by DashboardShell wrapper div).
 * Left: logo (mobile) + mobile menu trigger.
 * Right: notification bell with unread dot + avatar dropdown.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MobileMenuButton, SidebarDrawer } from "./Sidebar";

interface TopNavProps {
  clientName?: string;
  tier?: string;
}

function getInitials(name?: string): string {
  if (!name) return "CC";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TopNav({ clientName, tier = "starter" }: TopNavProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch unread notification count — graceful degradation if route 404s
  useEffect(() => {
    let cancelled = false;
    async function fetchUnread() {
      try {
        const res = await fetch("/api/dashboard/notifications?unread_count=1");
        if (!res.ok) return; // 404 is expected until Plan 04-06
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") {
          setUnreadCount(data.count);
        }
      } catch {
        // Network error — leave count at 0
      }
    }
    fetchUnread();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    router.push("/auth/signout");
  }, [router]);

  const initials = getInitials(clientName);

  return (
    <>
      <div className="h-full flex items-center justify-between px-4">
        {/* Left: mobile menu + logo */}
        <div className="flex items-center gap-3">
          <MobileMenuButton onClick={() => setDrawerOpen(true)} />
          {/* Logo — visible on mobile (md: sidebar shows logo instead) */}
          <span className="md:hidden text-[#C9A84C] font-heading text-lg font-semibold tracking-tight">
            Cosby Capital
          </span>
        </div>

        {/* Right: notification bell + avatar dropdown */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <Link
            href="/dashboard/notifications"
            aria-label={
              unreadCount > 0
                ? `Notifications — ${unreadCount} unread`
                : "Notifications"
            }
            className="relative p-2 text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:ring-offset-[#2D5016] rounded"
          >
            <Bell className="h-5 w-5" aria-hidden />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#C9A84C]"
                aria-hidden="true"
              />
            )}
          </Link>

          {/* Avatar dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                aria-label={`Account menu for ${clientName ?? "user"}`}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-[#C9A84C] text-[#2D5016] text-xs font-body font-semibold focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:ring-offset-[#2D5016]"
              >
                {initials}
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-[180px] rounded-md bg-white shadow-lg border border-gray-100 py-1 text-sm font-body"
              >
                {clientName && (
                  <>
                    <div className="px-3 py-2 text-gray-500 text-xs truncate max-w-[200px]">
                      {clientName}
                    </div>
                    <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                  </>
                )}
                <DropdownMenu.Item asChild>
                  <Link
                    href="/dashboard/settings"
                    className="flex w-full items-center px-3 py-2 text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer"
                  >
                    Account Settings
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />
                <DropdownMenu.Item asChild>
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center px-3 py-2 text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer"
                  >
                    Sign Out
                  </button>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      <SidebarDrawer
        tier={tier}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
