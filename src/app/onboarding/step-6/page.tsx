"use client";

/**
 * Step 6 — Subscription Selection
 *
 * Shows 4 tier cards with annual/monthly toggle.
 * On plan select: POSTs to /api/stripe/create-checkout and redirects to Stripe.
 * Handles ?success=true (redirect to dashboard after 2s) and ?canceled=true.
 * FTC affiliate disclosure shown at bottom.
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type BillingPeriod = "monthly" | "annual";

interface Tier {
  id: "starter" | "growth" | "capital_partner" | "done_for_you";
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  badge?: string;
  description: string;
  features: string[];
  cta: string;
  isCustom?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 49,
    annualPrice: 490,
    description: "Get started with lender and grant matching.",
    features: [
      "Up to 5 lender matches/month",
      "Up to 3 grant matches/month",
      "Basic credit roadmap",
      "Email support",
      "Monthly opportunity digest",
    ],
    cta: "Select Starter",
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPrice: 99,
    annualPrice: 990,
    description: "More matches, grant writing assistance, and priority support.",
    features: [
      "Up to 15 lender matches/month",
      "Up to 10 grant matches/month",
      "Grant writing assistance (2 apps/mo)",
      "Advanced credit roadmap",
      "Priority email + chat support",
      "Lender introduction authorization",
      "Monthly strategy call",
    ],
    cta: "Select Growth",
  },
  {
    id: "capital_partner",
    name: "Capital Partner",
    monthlyPrice: 199,
    annualPrice: 1990,
    badge: "Most Popular",
    description: "Unlimited matching, done-with-you grant writing, and dedicated advisor.",
    features: [
      "Unlimited lender matches",
      "Unlimited grant matches",
      "Grant writing (5 apps/mo)",
      "Dedicated capital advisor",
      "Credit coaching sessions",
      "Application review & feedback",
      "Same-day support",
      "Quarterly funding strategy review",
    ],
    cta: "Select Capital Partner",
  },
  {
    id: "done_for_you",
    name: "Done For You",
    monthlyPrice: null,
    annualPrice: null,
    description: "Full-service capital management. We handle everything.",
    features: [
      "Everything in Capital Partner",
      "Applications submitted on your behalf",
      "Dedicated account manager",
      "White-glove document preparation",
      "Unlimited grant writing",
      "Credit repair coordination",
      "Direct lender negotiations",
      "Custom success fee structure",
    ],
    cta: "Contact Us",
    isCustom: true,
  },
];

export default function Step6Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<"success" | "canceled" | null>(null);

  // Handle Stripe redirect-back query params
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (success === "true") {
      setCheckoutStatus("success");
      // Redirect to dashboard after 2 seconds
      const timer = setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (canceled === "true") {
      setCheckoutStatus("canceled");
    }
  }, [searchParams, router]);

  async function handleSelectPlan(tierId: string) {
    if (tierId === "done_for_you") {
      window.location.href = "mailto:sales@cosbycapital.com?subject=Done For You Inquiry";
      return;
    }

    setError(null);
    setCheckoutStatus(null);
    setSelectedTier(tierId);
    setLoading(true);

    try {
      // Save step 6 data before redirecting to Stripe
      const saveRes = await fetch("/api/onboarding/save-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 6,
          data: {
            selected_tier: tierId,
            billing_period: billing,
          },
        }),
      });

      if (!saveRes.ok) {
        const body = await saveRes.json() as { error?: string };
        setError(body.error ?? "Failed to save. Please try again.");
        setLoading(false);
        setSelectedTier(null);
        return;
      }

      // Create Stripe Checkout Session and redirect
      const checkoutRes = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierId,
          billing_period: billing,
        }),
      });

      if (!checkoutRes.ok) {
        const body = await checkoutRes.json() as { error?: string };
        setError(body.error ?? "Failed to start checkout. Please try again.");
        setLoading(false);
        setSelectedTier(null);
        return;
      }

      const { url } = await checkoutRes.json() as { url: string };
      if (url) {
        window.location.href = url;
      } else {
        setError("Checkout URL not returned. Please try again.");
        setLoading(false);
        setSelectedTier(null);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
      setSelectedTier(null);
    }
  }

  function getPrice(tier: Tier): string {
    if (tier.isCustom) return "Custom";
    const price = billing === "monthly" ? tier.monthlyPrice : tier.annualPrice;
    if (price === null) return "Custom";
    return billing === "monthly" ? `$${price}/mo` : `$${price}/yr`;
  }

  function getSavings(tier: Tier): string | null {
    if (!tier.monthlyPrice || !tier.annualPrice) return null;
    const annualIfMonthly = tier.monthlyPrice * 12;
    const saved = annualIfMonthly - tier.annualPrice;
    return saved > 0 ? `Save $${saved}/yr` : null;
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-2">
          Choose Your Plan
        </h2>
        <p className="text-sm text-gray-400 font-body">
          Select the plan that fits your business goals. You can upgrade anytime.
        </p>
      </div>

      {checkoutStatus === "success" && (
        <div
          role="status"
          className="mb-6 rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-400 font-body"
        >
          <span className="font-medium">Payment successful!</span> Setting up your account — redirecting to dashboard…
        </div>
      )}

      {checkoutStatus === "canceled" && (
        <div
          role="alert"
          className="mb-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 text-sm text-yellow-400 font-body"
        >
          Checkout canceled. Select a plan below when you&apos;re ready.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-body"
        >
          {error}
        </div>
      )}

      {/* Annual/Monthly toggle */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center bg-white/5 border border-white/15 rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setBilling("monthly")}
            className={[
              "px-5 py-2 rounded-lg text-sm font-body font-medium transition-colors",
              billing === "monthly"
                ? "bg-[#C9A84C] text-[#0A1628]"
                : "text-gray-400 hover:text-white",
            ].join(" ")}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling("annual")}
            className={[
              "px-5 py-2 rounded-lg text-sm font-body font-medium transition-colors flex items-center gap-2",
              billing === "annual"
                ? "bg-[#C9A84C] text-[#0A1628]"
                : "text-gray-400 hover:text-white",
            ].join(" ")}
          >
            Annual
            <span
              className={[
                "text-xs px-1.5 py-0.5 rounded font-medium",
                billing === "annual"
                  ? "bg-[#0A1628]/30 text-[#0A1628]"
                  : "bg-green-500/20 text-green-400",
              ].join(" ")}
            >
              2 months free
            </span>
          </button>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {TIERS.map((tier) => {
          const isSelected = selectedTier === tier.id;
          const isPopular = tier.badge === "Most Popular";
          const savings = getSavings(tier);

          return (
            <div
              key={tier.id}
              className={[
                "relative rounded-2xl border p-6 flex flex-col transition-colors",
                isPopular
                  ? "border-[#C9A84C] bg-[#C9A84C]/5"
                  : "border-white/15 bg-white/5",
              ].join(" ")}
            >
              {/* Popular badge */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-[#C9A84C] text-[#0A1628] text-xs font-semibold font-body">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold font-heading text-white mb-1">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-heading text-[#C9A84C]">
                    {getPrice(tier)}
                  </span>
                  {billing === "annual" && savings && (
                    <span className="text-xs text-green-400 font-body font-medium">
                      {savings}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 font-body mt-2">
                  {tier.description}
                </p>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <svg
                      className="h-4 w-4 text-[#C9A84C] flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-xs text-gray-300 font-body">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSelectPlan(tier.id)}
                disabled={loading}
                className={[
                  "w-full py-3 rounded-xl text-sm font-semibold font-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                  isPopular || tier.isCustom
                    ? "bg-[#C9A84C] text-[#0A1628] hover:bg-[#d4b568]"
                    : "border border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10",
                ].join(" ")}
              >
                {loading && isSelected ? "Processing…" : tier.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Feature comparison note */}
      <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/5">
        <p className="text-xs text-gray-400 font-body text-center">
          All plans include access to the Cosby Capital dashboard, AI-powered
          lender &amp; grant matching, and the client onboarding portal.
          Upgrade or cancel anytime.
        </p>
      </div>

      {/* FTC affiliate disclosure */}
      <p className="text-xs text-gray-500 font-body text-center leading-relaxed">
        <span className="font-medium text-gray-400">Affiliate Disclosure:</span>{" "}
        Cosby Capital may receive compensation from lenders for introductions.
        This does not affect our matching algorithm or the recommendations we
        provide to clients.
      </p>

      <div className="mt-6 flex justify-start">
        <button
          type="button"
          onClick={() => router.push("/onboarding/step-5")}
          disabled={loading}
          className="px-6 py-3 rounded-lg border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 disabled:opacity-50 transition-colors"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
