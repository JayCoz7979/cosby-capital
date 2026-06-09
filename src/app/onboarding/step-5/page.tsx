"use client";

/**
 * Step 5 — Consulting Agreement (Signature)
 *
 * Wires in the real SignatureModal (Plan 02-04).
 * SignatureModal is loaded dynamically (client-only) via next/dynamic.
 *
 * Flow:
 *   1. User sees the agreement preview card
 *   2. Clicks "Sign Agreement" → SignatureModal opens
 *   3. Completes 6-step signature flow
 *   4. onComplete fires → save-step for step 5 → navigate to step-6
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamically imported — SignatureModal is client-only (uses browser APIs)
const SignatureModal = dynamic(
  () => import("@/components/signature/SignatureModal"),
  { ssr: false }
);

export default function Step5Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function handleSignatureComplete(signatureId: string) {
    setModalOpen(false);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/save-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 5,
          data: {
            step_reached: true,
            signature_id: signatureId,
            signed_at: new Date().toISOString(),
          },
        }),
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
    <>
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
                  Performance-based success fee applies only upon confirmed receipt
                  of funding. Grants: 5%. Loans under $100K: 3%. $100K–$500K: 2%.
                  $500K+: 1%.
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
                <p className="font-medium text-gray-200">Termination</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  You may cancel at any time with 30 days written notice. Success
                  fees remain due on funding received prior to termination.
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-200">Governing Law</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  Agreement governed by Alabama law. Disputes resolved by binding
                  arbitration in Birmingham, Alabama.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sign button */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/onboarding/step-4")}
              disabled={loading}
              className="px-6 py-3 rounded-lg border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 disabled:opacity-50 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={loading}
              className="flex-1 py-3.5 rounded-xl bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Saving…" : "Sign Agreement"}
            </button>
          </div>
          <p className="text-xs text-gray-500 font-body text-center">
            You will review the full agreement before signing. Electronic signature
            is legally binding under the E-SIGN Act.
          </p>
        </div>
      </div>

      {/* SignatureModal — rendered outside the card so it overlays the full screen */}
      <SignatureModal
        isOpen={modalOpen}
        documentType="consulting_agreement"
        onComplete={handleSignatureComplete}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
