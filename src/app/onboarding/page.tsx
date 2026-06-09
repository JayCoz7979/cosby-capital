/**
 * Onboarding router — server component.
 * Checks last_completed_step and redirects to the appropriate step page.
 * New users → step-1. Already complete → /dashboard.
 */

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";

export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/auth/login?redirect=/onboarding");
  }

  const { data: onboardingSession } = await supabase
    .from("onboarding_sessions")
    .select("completed, last_completed_step")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (onboardingSession?.completed) {
    redirect("/dashboard");
  }

  const lastStep = onboardingSession?.last_completed_step ?? 0;
  const nextStep = Math.min(lastStep + 1, 6);

  redirect(`/onboarding/step-${nextStep}`);
}
