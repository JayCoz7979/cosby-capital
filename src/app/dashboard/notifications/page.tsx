/**
 * /dashboard/notifications — full notification history page.
 *
 * Server component: fetches initial notifications server-side, passes to
 * NotificationsPageClient which manages Realtime + mark-all-read.
 *
 * Auth + client guard already enforced by dashboard/layout.tsx.
 * This page uses serviceClient for server-side data fetch (anon key has RLS).
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { NotificationsPageClient } from "./NotificationsPageClient";
import type { Notification } from "@/components/dashboard/NotificationFeed";

export const metadata: Metadata = {
  title: "Notifications | Cosby Capital",
};

export default async function NotificationsPage() {
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login?redirect=/dashboard/notifications");
  }

  const serviceClient = createServiceClient();

  // Resolve client record
  const { data: client } = await serviceClient
    .from("clients")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!client) {
    redirect("/onboarding");
  }

  // Fetch initial notifications — server-side for fast first paint
  const { data: notifications } = await serviceClient
    .from("notifications")
    .select("id, type, title, body, read, read_at, action_url, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const initialNotifications: Notification[] = notifications ?? [];

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">
        Notifications
      </h1>

      <NotificationsPageClient
        clientId={client.id}
        initialNotifications={initialNotifications}
      />
    </div>
  );
}
