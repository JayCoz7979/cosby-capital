"use client";

/**
 * NotificationsPageClient — client wrapper for the notifications history page.
 *
 * Renders NotificationFeed (which manages Realtime + individual mark-read) and
 * a "Mark All Read" button that calls PATCH mark_all=true then syncs local state.
 */

import React, { useState, useCallback } from "react";
import { NotificationFeed, type Notification } from "@/components/dashboard/NotificationFeed";
import { useNotificationContext } from "@/components/dashboard/NotificationContext";
import { Button } from "@/components/ui/button";

interface NotificationsPageClientProps {
  clientId: string;
  initialNotifications: Notification[];
}

export function NotificationsPageClient({
  clientId,
  initialNotifications,
}: NotificationsPageClientProps) {
  const { setUnreadCount } = useNotificationContext();
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);

    try {
      const res = await fetch("/api/dashboard/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all: true }),
      });

      if (res.ok) {
        const now = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true, read_at: n.read_at ?? now }))
        );
        setUnreadCount(0);
      }
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, setUnreadCount]);

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="space-y-4">
      {/* Mark All Read action */}
      {hasUnread && (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={handleMarkAllRead}
            disabled={markingAll}
          >
            {markingAll ? "Marking all read…" : "Mark All Read"}
          </Button>
        </div>
      )}

      {/* Feed — manages Realtime subscription + individual mark-read */}
      <NotificationFeed
        clientId={clientId}
        initialNotifications={notifications}
      />
    </div>
  );
}
