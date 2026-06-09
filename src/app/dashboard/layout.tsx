/**
 * Dashboard layout — server component.
 *
 * Auth guard: redirects to /auth/login if no session.
 * Client guard: redirects to /onboarding if no client record.
 * Wraps all /dashboard/* routes in DashboardShell.
 *
 * Threat T-04-01-01: createServerClient() + getSession() enforced here (ASVS 4.1).
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopNav } from "@/components/dashboard/TopNav";

export const metadata: Metadata = {
  title: {
    default: "Dashboard | Cosby Capital",
    template: "%s | Dashboard | Cosby Capital",
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // T-04-01-01: reject unauthenticated requests
  if (!session) {
    redirect("/auth/login?redirect=/dashboard");
  }

  // Fetch client record — required for tier and name
  const { data: client } = await supabase
    .from("clients")
    .select("id, owner_name, subscription_tier")
    .eq("user_id", session.user.id)
    .maybeSingle();

  // If onboarding not complete, send back to onboarding
  if (!client) {
    redirect("/onboarding");
  }

  const tier = client.subscription_tier ?? "starter";
  const ownerName = client.owner_name ?? undefined;

  return (
    <DashboardShell
      sidebar={<Sidebar tier={tier} />}
      topnav={<TopNav clientName={ownerName} tier={tier} />}
    >
      {children}
    </DashboardShell>
  );
}
