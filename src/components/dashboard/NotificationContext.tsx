"use client";

/**
 * NotificationContext — shared unread count state between NotificationFeed and TopNav.
 *
 * NotificationFeed writes unreadCount (via setUnreadCount) as notifications arrive.
 * TopNav reads unreadCount to drive the gold dot on the bell icon.
 *
 * DashboardShell wraps its children in NotificationContextProvider so both
 * components share the same context instance.
 *
 * No Supabase dependency — pure React context.
 */

import React, { createContext, useContext, useState } from "react";

interface NotificationContextValue {
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  return (
    <NotificationContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotificationContext must be used within NotificationContextProvider"
    );
  }
  return ctx;
}
