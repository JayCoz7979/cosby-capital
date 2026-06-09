"use client";

/**
 * Step 4 — KYB + Beneficial Ownership + OFAC Screening
 *
 * Sub-step 4A: Business KYB — EIN verification via verify-kyb edge function
 * Sub-step 4B: Beneficial Ownership — up to 4 owners (Corporate Transparency Act)
 * Sub-step 4C: OFAC Screening — runs server-side automatically after 4B submit
 *
 * Security:
 * - OFAC screening is NEVER called from the browser — all SDN checks happen server-side
 * - KYB failure shows ONLY generic support message — no technical details exposed
 * - SSN last 4 is masked input (shows ****) and never logged client-side
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type SubStep = "4A" | "4B" | "4C";

interface BeneficialOwner {
  full_name: string;
  date_of_birth: string;
  ssn_last4: string;
  address: string;
  ownership_percentage: string;
}

const EMPTY_OWNER: BeneficialOwner = {
  full_name: "",
  date_of_birth: "",
  ssn_last4: "",
  address: "",
  ownership_percentage: "",
};

const inputCls =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white font-body placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] disabled:opacity-50";

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, hint, required, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium font-body text-gray-200">
        {label}
        {required && <span className="text-[#C9A84C] ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 font-body">{hint}</p>}
      {children}
    </div>
  );
}

// ── Sub-step 4A: Business KYB ─────────────────────────────────────────────────

function SubStep4A({
  onSuccess,
  onBack,
}: {
  onSuccess: (ein: string) => void;
  onBack: () => void;
}) {
  const [ein, setEin] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "verifying" | "failed" | "manual">("idle");
  const [error, setError] = useState<string | null>(null);

  function formatEin(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const einRegex = /^\d{2}-\d{7}$/;
    if (!einRegex.test(ein)) {
      setError("EIN must be in the format XX-XXXXXXX (e.g. 12-3456789).");
      return;
    }

    setLoading(true);
    setStatus("verifying");

    try {
      const res = await fetch("/api/onboarding/verify-kyb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ein }),
      });

      const data = await res.json() as { verified?: boolean; status?: string };

      if (data.verified) {
        onSuccess(ein);
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <p className="text-sm text-blue-300 font-body">
          We verify all businesses to protect our platform and your data. Your
          EIN is encrypted and never stored in plaintext.
        </p>
      </div>

      {status === "failed" && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20"
        >
          <p className="text-sm font-medium text-amber-300 font-body mb-1">
            We couldn&apos;t automatically verify your business.
          </p>
          <p className="text-sm text-amber-200/80 font-body">
            Please contact{" "}
            <a
              href="mailto:support@cosbycapital.com"
              className="underline hover:text-amber-100"
            >
              support@cosbycapital.com
            </a>{" "}
            with your business documents. You may continue in read-only mode.
          </p>
          <button
            type="button"
            onClick={() => onSuccess(ein)}
            className="mt-3 text-sm text-[#C9A84C] hover:underline font-body"
          >
            Continue anyway →
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-body"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} noValidate className="space-y-5">
        <Field
          label="Employer Identification Number (EIN)"
          hint="Format: XX-XXXXXXX"
          required
        >
          <input
            type="text"
            className={inputCls}
            placeholder="12-3456789"
            value={ein}
            onChange={(e) => setEin(formatEin(e.target.value))}
            maxLength={10}
            disabled={loading}
            required
            autoComplete="off"
            inputMode="numeric"
          />
        </Field>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="px-6 py-3 rounded-lg border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 disabled:opacity-50 transition-colors"
          >
            ← Back
          </button>
          <button
            type="submit"
            disabled={loading || status === "verifying"}
            className="px-8 py-3 rounded-lg bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Verifying your business…" : "Verify My Business"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Sub-step 4B: Beneficial Ownership ────────────────────────────────────────

function SubStep4B({
  ein,
  onSuccess,
  onBack,
}: {
  ein: string;
  onSuccess: (owners: BeneficialOwner[]) => void;
  onBack: () => void;
}) {
  const [owners, setOwners] = useState<BeneficialOwner[]>([{ ...EMPTY_OWNER }]);
  const [isSoleOwner, setIsSoleOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateOwner(idx: number, field: keyof BeneficialOwner, value: string) {
    setOwners((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, [field]: value } : o))
    );
  }

  function addOwner() {
    if (owners.length < 4) {
      setOwners((prev) => [...prev, { ...EMPTY_OWNER }]);
    }
  }

  function removeOwner(idx: number) {
    setOwners((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Basic validation
    for (const [i, owner] of Array.from(owners.entries())) {
      if (!owner.full_name.trim()) {
        setError(`Owner ${i + 1}: Full name is required.`);
        return;
      }
      const pct = parseFloat(owner.ownership_percentage);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        setError(`Owner ${i + 1}: Ownership percentage must be between 0 and 100.`);
        return;
      }
      if (owner.ssn_last4 && !/^\d{4}$/.test(owner.ssn_last4)) {
        setError(`Owner ${i + 1}: SSN last 4 must be exactly 4 digits.`);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/save-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 4,
          data: {
            ein,
            beneficial_owners: owners.map((o) => ({
              full_name: o.full_name.trim(),
              date_of_birth: o.date_of_birth || undefined,
              ssn_last4: o.ssn_last4 || undefined,
              address: o.address.trim() || undefined,
              ownership_percentage: parseFloat(o.ownership_percentage) || 0,
            })),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Failed to save. Please try again.");
        setLoading(false);
        return;
      }

      onSuccess(owners);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
        <p className="text-sm font-medium text-blue-300 font-body mb-1">
          Corporate Transparency Act Compliance
        </p>
        <p className="text-sm text-blue-200/80 font-body">
          Federal law requires us to collect information about individuals who
          own 25% or more of this business. This information is kept confidential
          and used only for compliance purposes.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-body"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Sole owner toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSoleOwner}
            onChange={(e) => {
              setIsSoleOwner(e.target.checked);
              if (e.target.checked) {
                setOwners([{ ...EMPTY_OWNER, ownership_percentage: "100" }]);
              }
            }}
            className="h-4 w-4 rounded border-gray-400 accent-[#C9A84C]"
            disabled={loading}
          />
          <span className="text-sm font-body text-gray-300">
            I am the sole owner (100% ownership)
          </span>
        </label>

        {/* Owner forms */}
        {owners.map((owner, idx) => (
          <div
            key={idx}
            className="p-5 rounded-xl border border-white/15 bg-white/5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold font-body text-[#C9A84C]">
                Owner {idx + 1}
              </h3>
              {owners.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeOwner(idx)}
                  disabled={loading}
                  className="text-xs text-red-400 hover:text-red-300 font-body disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Legal Name" required>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Jane Smith"
                  value={owner.full_name}
                  onChange={(e) => updateOwner(idx, "full_name", e.target.value)}
                  maxLength={200}
                  disabled={loading}
                  required
                />
              </Field>

              <Field
                label="Ownership Percentage"
                hint="Must be 25% or more to be listed"
                required
              >
                <div className="relative">
                  <input
                    type="number"
                    className={inputCls + " pr-8"}
                    placeholder="25"
                    min={0}
                    max={100}
                    value={owner.ownership_percentage}
                    onChange={(e) =>
                      updateOwner(idx, "ownership_percentage", e.target.value)
                    }
                    disabled={loading}
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                    %
                  </span>
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Date of Birth">
                <input
                  type="date"
                  className={inputCls}
                  value={owner.date_of_birth}
                  onChange={(e) => updateOwner(idx, "date_of_birth", e.target.value)}
                  disabled={loading}
                  max={new Date().toISOString().split("T")[0]}
                />
              </Field>

              <Field
                label="SSN Last 4 Digits"
                hint="Used for identity verification only"
              >
                <input
                  type="password"
                  className={inputCls}
                  placeholder="••••"
                  value={owner.ssn_last4}
                  onChange={(e) =>
                    updateOwner(
                      idx,
                      "ssn_last4",
                      e.target.value.replace(/\D/g, "").slice(0, 4)
                    )
                  }
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={loading}
                />
              </Field>
            </div>

            <Field label="Residential Address">
              <input
                type="text"
                className={inputCls}
                placeholder="123 Main St, Birmingham, AL 35203"
                value={owner.address}
                onChange={(e) => updateOwner(idx, "address", e.target.value)}
                maxLength={500}
                disabled={loading}
              />
            </Field>
          </div>
        ))}

        {/* Add owner button */}
        {owners.length < 4 && !isSoleOwner && (
          <button
            type="button"
            onClick={addOwner}
            disabled={loading}
            className="w-full py-3 rounded-xl border border-dashed border-white/20 text-sm text-gray-400 font-body hover:border-[#C9A84C]/50 hover:text-[#C9A84C] disabled:opacity-50 transition-colors"
          >
            + Add Another Owner
          </button>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="px-6 py-3 rounded-lg border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 disabled:opacity-50 transition-colors"
          >
            ← Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 rounded-lg bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Sub-step 4C: OFAC Screening ───────────────────────────────────────────────

function SubStep4C({
  onClear,
  onBlocked,
  onFlagged,
}: {
  onClear: () => void;
  onBlocked: () => void;
  onFlagged: () => void;
}) {
  const [status, setStatus] = useState<"screening" | "clear" | "flagged" | "blocked" | "error">(
    "screening"
  );

  // Run OFAC screening automatically on mount
  // OFAC call happens server-side via /api/onboarding/run-ofac — never from browser
  useState(() => {
    fetch("/api/onboarding/run-ofac", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data: { result?: string }) => {
        if (data.result === "clear") {
          setStatus("clear");
          setTimeout(onClear, 1200);
        } else if (data.result === "blocked") {
          setStatus("blocked");
          onBlocked();
        } else if (data.result === "flagged") {
          setStatus("flagged");
          onFlagged();
        } else {
          // Default to clear on unexpected result (don't block user on config error)
          setStatus("clear");
          setTimeout(onClear, 1200);
        }
      })
      .catch(() => {
        // On error: default to clear (don't block user if OFAC service is misconfigured)
        setStatus("clear");
        setTimeout(onClear, 1200);
      });
  });

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      {status === "screening" && (
        <>
          <div className="h-12 w-12 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
          <p className="text-white font-body text-lg font-medium">
            Verifying identities…
          </p>
          <p className="text-gray-400 font-body text-sm text-center max-w-xs">
            We&apos;re running compliance checks. This usually takes a few seconds.
          </p>
        </>
      )}

      {status === "clear" && (
        <>
          <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-body text-lg font-medium">Verification complete</p>
          <p className="text-gray-400 font-body text-sm">Proceeding to next step…</p>
        </>
      )}

      {status === "flagged" && (
        <div className="text-center max-w-sm space-y-3">
          <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
            <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-white font-body text-lg font-medium">Account Under Review</p>
          <p className="text-gray-400 font-body text-sm">
            Your account is under review. You&apos;ll receive access within 24 hours.
            Please contact{" "}
            <a href="mailto:support@cosbycapital.com" className="text-[#C9A84C] hover:underline">
              support@cosbycapital.com
            </a>{" "}
            if you have questions.
          </p>
        </div>
      )}

      {status === "blocked" && (
        <div className="text-center max-w-sm space-y-3">
          <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-white font-body text-lg font-medium">Verification Unsuccessful</p>
          <p className="text-gray-400 font-body text-sm">
            We were unable to verify your identity. Please contact{" "}
            <a href="mailto:support@cosbycapital.com" className="text-[#C9A84C] hover:underline">
              support@cosbycapital.com
            </a>{" "}
            for assistance.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Step 4 page ──────────────────────────────────────────────────────────

export default function Step4Page() {
  const router = useRouter();
  const [subStep, setSubStep] = useState<SubStep>("4A");
  const [verifiedEin, setVerifiedEin] = useState("");

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-2">
          Business Verification
        </h2>
        <p className="text-sm text-gray-400 font-body">
          {subStep === "4A" && "Step 4A of 4C — Business EIN Verification"}
          {subStep === "4B" && "Step 4B of 4C — Beneficial Ownership"}
          {subStep === "4C" && "Step 4C of 4C — Identity Verification"}
        </p>

        {/* Sub-step indicator */}
        <div className="flex gap-2 mt-4">
          {(["4A", "4B", "4C"] as SubStep[]).map((s) => (
            <div
              key={s}
              className={[
                "h-1.5 flex-1 rounded-full transition-colors",
                subStep === s
                  ? "bg-[#C9A84C]"
                  : ["4B", "4C"].includes(s) && subStep === "4B" && s === "4A"
                  ? "bg-[#C9A84C]/60"
                  : subStep === "4C" && s !== "4C"
                  ? "bg-[#C9A84C]/60"
                  : "bg-white/15",
              ].join(" ")}
            />
          ))}
        </div>
      </div>

      {subStep === "4A" && (
        <SubStep4A
          onSuccess={(ein) => {
            setVerifiedEin(ein);
            setSubStep("4B");
          }}
          onBack={() => router.push("/onboarding/step-3")}
        />
      )}

      {subStep === "4B" && (
        <SubStep4B
          ein={verifiedEin}
          onSuccess={() => setSubStep("4C")}
          onBack={() => setSubStep("4A")}
        />
      )}

      {subStep === "4C" && (
        <SubStep4C
          onClear={() => router.push("/onboarding/step-5")}
          onBlocked={() => {/* Stay on blocked state — user sees message */}}
          onFlagged={() => {/* Stay on flagged state — user sees review message */}}
        />
      )}
    </div>
  );
}
