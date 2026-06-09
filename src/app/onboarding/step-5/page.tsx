"use client";

/**
 * Step 5 — Consulting Agreement (Signature)
 *
 * Checks at runtime whether SignatureModal is available (Plan 02-04).
 * If available: shows "Sign Agreement" button (wired in follow-up once 02-04 merges).
 * If not available: shows placeholder with Continue button → routes to step-6.
 *
 * Note: SignatureModal is NOT statically imported here because Plan 02-04 builds
 * it in parallel during Wave 2. Once 02-04 merges, this page will be updated to
 * wire the modal directly (the availability check will become a static import).
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Step5Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Will be true once Plan 02-04 (SignatureModal) merges and the component is available
  const [signatureModalAvailable, setSignatureModalAvailable] = useState(false);

  // Check whether the SignatureModal component is available in this build.
  // Uses a lightweight API probe rather than a static import, since 02-04 runs
  // in parallel and the component file may not exist yet.
  useEffect(() => {
    fetch("/api/onboarding/signature-modal-available")
      .then((r) => r.json())
      .then((d: { available?: boolean }) => {
        setSignatureModalAvailable(d.available === true);
      })
      .catch(() => setSignatureModalAvailable(false));
  }, []);

  async function handleContinue() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/save-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: 5, data: { step_reached: true } }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Failed to save. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/onboarding/step-6");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-2">
          Consulting Agreement
        </h2>
        <p className="text-sm text-gray-400 font-body">
          Review and sign the Business Consulting &amp; Capital Advisory Agreement
          before proceeding to subscription selection.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-body"
        >
          {error}
        </div>
      )}

      {/* Agreement preview card */}
      <div className="mb-6 rounded-xl border border-white/15 bg-white/5 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold font-body text-white">
              Business Consulting &amp; Capital Advisory Agreement
            </p>
            <p className="text-xs text-gray-400 font-body mt-0.5">
              Version 1.0 — Cosby Capital
            </p>
          </div>
          <div className="px-2.5 py-1 rounded bg-[#C9A84C]/15 border border-[#C9A84C]/30">
            <span className="text-xs text-[#C9A84C] font-body font-medium">
              Ready to Sign
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm text-gray-300 font-body leading-relaxed max-h-64 overflow-y-auto">
          <p className="font-semibold text-white">Summary of Key Terms</p>

          <div className="space-y-3">
            <div>
              <p className="font-medium text-gray-200">Services Provided</p>
              <p className="text-gray-400 text-xs mt-0.5">
                Cosby Capital provides business consulting, capital advisory,
                grant research, lender matching, and related advisory services.
                We are a consulting firm, not a lender or loan broker.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-200">Success Fee Structure</p>
              <p className="text-gray-400 text-xs mt-0.5">
                A performance-based success fee applies only upon confirmed
                receipt of funding. Loan fees: 10% (under $50K) to 2% (over
                $1M). Grant fees: 10% (under $25K) to 4% (over $500K).
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-200">No Guarantee of Funding</p>
              <p className="text-gray-400 text-xs mt-0.5">
                Cosby Capital does not guarantee funding approval. We facilitate
                introductions and provide advisory services only. Final lending
                decisions rest with individual lenders.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-200">Client Applies Directly</p>
              <p className="text-gray-400 text-xs mt-0.5">
                You submit all applications directly to lenders and grantors.
                Cosby Capital assists with preparation and strategy but does not
                submit on your behalf without explicit written authorization.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-200">FTC Affiliate Disclosure</p>
              <p className="text-gray-400 text-xs mt-0.5">
                Cosby Capital may receive compensation from lenders for
                introductions. This does not affect our matching algorithm or
                recommendations.
              </p>
            </div>
          </div>
        </div>
      </div>

      {signatureModalAvailable ? (
        /* SignatureModal available — sign button shown (wired in 02-04 follow-up) */
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Sign Agreement"}
          </button>
          <p className="text-xs text-gray-500 font-body text-center">
            By continuing, you acknowledge and agree to the terms above.
          </p>
        </div>
      ) : (
        /* Placeholder: SignatureModal not yet available (Wave 2 parallel build) */
        <>
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-300 font-body">
              <span className="font-medium">
                Consulting Agreement — Ready to Sign.
              </span>{" "}
              The signature component will be available in the next build step
              (Plan 02-04). You can continue to subscription selection now.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push("/onboarding/step-4")}
              disabled={loading}
              className="px-6 py-3 rounded-lg border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 disabled:opacity-50 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={loading}
              className="px-8 py-3 rounded-lg bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Saving…" : "Continue →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
