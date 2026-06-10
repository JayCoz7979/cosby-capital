"use client";

/**
 * NotificationFeed — real-time notification list.
 *
 * Subscribes to Supabase Realtime 'notifications-feed' channel filtered by
 * client_id. New inserts appear in the feed without page refresh.
 *
 * Writes unreadCount to NotificationContext so TopNav bell updates live.
 *
 * Threat mitigations:
 *   T-04-06-01: channel filter `client_id=eq.${clientId}` + RLS "notifs_own" enforces server-side isolation
 *   T-04-06-04: clientId exposed to client component (accepted — needed for Realtime filter; RLS enforces isolation)
 */

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { useNotificationContext } from "@/components/dashboard/NotificationContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";

// Validate action_url before rendering as a link — prevents javascript: XSS
// and open redirects to external domains (CR-03).
function isSafeActionUrl(url: string | null): boolean {
  if (!url) return false
  // Allow relative paths (most common case for internal navigation)
  if (url.startsWith('/')) return true
  // Allow absolute URLs on the same origin only
  try {
    const parsed = new URL(url)
    return parsed.origin === window.location.origin
  } catch {
    return false
  }
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  read_at: string | null;
  action_url: string | null;
  created_at: string;
}

interface NotificationFeedProps {
  clientId: string;
  initialNotifications: Notification[];
}

export function NotificationFeed({
  clientId,
  initialNotifications,
}: NotificationFeedProps) {
  const { setUnreadCount } = useNotificationContext();
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connected" | "connecting" | "disconnected"
  >("connecting");
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  // Set initial unread count from server-fetched data and subscribe to Realtime
  useEffect(() => {
    // Seed context with server-side unread count
    setUnreadCount(initialNotifications.filter((n) => !n.read).length);

    // Subscribe to postgres_changes for new notifications filtered by client_id
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("disconnected");
        } else {
          setRealtimeStatus("connecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleMarkRead = useCallback(
    async (notifId: string) => {
      if (markingIds.has(notifId)) return;
      setMarkingIds((prev) => new Set(prev).add(notifId));

      try {
        const res = await fetch("/api/dashboard/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [notifId] }),
        });

        if (res.ok) {
          const now = new Date().toISOString();
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notifId ? { ...n, read: true, read_at: now } : n
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } finally {
        setMarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(notifId);
          return next;
        });
      }
    },
    [markingIds, setUnreadCount]
  );

  return (
    <div>
      {/* Reconnection banner — shown when Realtime drops */}
      {realtimeStatus === "disconnected" && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-700 text-sm font-body px-4 py-2 rounded-md mb-3 flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Live updates paused. Reconnecting&hellip;
        </div>
      )}

      {/* Empty state */}
      {notifications.length === 0 && (
        <EmptyState
          heading="You're All Caught Up"
          body="New activity will appear here as your agents find matches and process requests."
        />
      )}

      {/* Notification list */}
      {notifications.length > 0 && (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`min-h-[44px] rounded-md px-4 py-3 border-l-4 ${
                !n.read
                  ? "bg-white border-[#C9A84C]"
                  : "bg-gray-50 border-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex items-center gap-2">
                    {!n.read && (
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-semibold font-body text-gray-900 truncate">
                      {n.title}
                    </span>
                  </div>

                  {/* Body */}
                  {n.body && (
                    <p className="text-sm font-body text-gray-600 mt-0.5 pl-4">
                      {n.body}
                    </p>
                  )}

                  {/* Action link — only rendered for safe relative/same-origin URLs (CR-03) */}
                  {n.action_url && isSafeActionUrl(n.action_url) && (
                    <Link
                      href={n.action_url}
                      className="text-[#2D5016] text-xs hover:underline font-body mt-1 block pl-4"
                    >
                      View details
                    </Link>
                  )}

                  {/* Timestamp */}
                  <p className="text-xs text-gray-400 font-body mt-1 pl-4">
                    {new Date(n.created_at).toLocaleDateString()}{" "}
                    {new Date(n.created_at).toLocaleTimeString()}
                  </p>
                </div>

                {/* Mark as Read button */}
                {!n.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkRead(n.id)}
                    disabled={markingIds.has(n.id)}
                    className="flex-shrink-0 text-xs"
                  >
                    {markingIds.has(n.id) ? "Marking…" : "Mark as Read"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
