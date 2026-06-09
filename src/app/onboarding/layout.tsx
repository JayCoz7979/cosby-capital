/**
 * Onboarding layout — server component.
 *
 * - Requires auth: redirects to /auth/login if no session
 * - Redirects to /dashboard if onboarding already completed
 * - Shows gold-on-navy progress bar with step labels
 * - Cosby Capital logo top-left, "Powered by Cosby AI Solutions" footer
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { OnboardingProgressBar } from "@/components/onboarding/OnboardingProgressBar";

export const metadata: Metadata = {
  title: {
    default: "Onboarding | Cosby Capital",
    template: "%s | Cosby Capital",
  },
};

const STEP_LABELS = [
  "Business Info",
  "Funding Goals",
  "Business Flags",
  "Verification",
  "Agreement",
  "Subscription",
];

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Require auth
  if (!session) {
    redirect("/auth/login?redirect=/onboarding");
  }

  // Check if onboarding already completed — redirect to dashboard
  const { data: onboardingSession } = await supabase
    .from("onboarding_sessions")
    .select("completed, last_completed_step")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (onboardingSession?.completed) {
    redirect("/dashboard");
  }

  const currentStep = (onboardingSession?.last_completed_step ?? 0) + 1;

  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-xl font-bold font-heading text-[#C9A84C] tracking-tight">
            Cosby Capital
          </h1>
          <p className="text-xs text-gray-400 font-body tracking-widest uppercase">
            Client Onboarding
          </p>
        </div>

        {/* Save & Exit — navigates to dashboard (session data is already saved per step) */}
        <a
          href="/dashboard"
          className="text-sm text-gray-400 hover:text-[#C9A84C] font-body transition-colors"
        >
          Save &amp; Exit
        </a>
      </header>

      {/* Progress bar */}
      <div className="px-6 py-4 border-b border-white/10">
        <OnboardingProgressBar
          currentStep={currentStep}
          totalSteps={6}
          stepLabels={STEP_LABELS}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center border-t border-white/10">
        <p className="text-xs text-gray-500 font-body">
          Powered by{" "}
          <a
            href="https://cosbyaisolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C9A84C] hover:underline"
          >
            Cosby AI Solutions
          </a>
        </p>
      </footer>
    </div>
  );
}
