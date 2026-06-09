"use client";

/**
 * SignatureModal — 6-step electronic signature flow.
 *
 * Step 1: Document display (scroll enforcement via AgreementViewer)
 * Step 2: Acknowledgment checkboxes (7 required)
 * Step 3: Identity verification (typed name must match owner_name, Unicode NFC)
 * Step 4: Signature preview (Dancing Script rendering)
 * Step 5: Processing (POST to /api/signature/execute)
 * Step 6: Confirmation (signature ID shown, onComplete called)
 *
 * Security:
 * - signed_at is NEVER supplied by the client — set server-side only
 * - signed_name is Unicode NFC normalized before comparison (homograph defense)
 * - Device fingerprint captured via lib/device-fingerprint.ts
 */

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  CONSULTING_AGREEMENT_TEXT,
  CONSULTING_AGREEMENT_VERSION,
  ACKNOWLEDGMENT_CHECKBOXES,
  computeDocumentHash,
} from "@/lib/agreements/consulting-agreement";
import { generateFingerprint } from "@/lib/device-fingerprint";

// Lazy-load sub-components (client only)
const AgreementViewer = dynamic(() => import("./AgreementViewer"), {
  ssr: false,
});
const CheckboxList = dynamic(() => import("./CheckboxList"), { ssr: false });

export type DocumentType =
  | "consulting_agreement"
  | "grant_writing_auth"
  | "grant_submission_auth"
  | "lender_intro_auth"
  | "success_fee_acknowledgment"
  | "monthly_report_auth"
  | "croa_agreement";

export interface SignatureModalProps {
  isOpen: boolean;
  documentType: DocumentType;
  onComplete: (signatureId: string) => void;
  onClose: () => void;
}

type ModalStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS: Record<ModalStep, string> = {
  1: "Step 1 of 6 — Read the Agreement",
  2: "Step 2 of 6 — Acknowledge Terms",
  3: "Step 3 of 6 — Verify Identity",
  4: "Step 4 of 6 — Review Signature",
  5: "Step 5 of 6 — Processing",
  6: "Step 6 of 6 — Confirmation",
};

/** Unicode NFC normalize — prevents homograph attacks on name comparison */
function normalizeNFC(str: string): string {
  return str.normalize("NFC").trim();
}

export default function SignatureModal({
  isOpen,
  documentType,
  onComplete,
  onClose,
}: SignatureModalProps) {
  const [step, setStep] = useState<ModalStep>(1);

  // Step 1 state
  const [hasScrolled, setHasScrolled] = useState(false);

  // Step 2 state
  const [allChecked, setAllChecked] = useState(false);

  // Step 3 state
  const [typedName, setTypedName] = useState("");
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [nameMatchError, setNameMatchError] = useState<string | null>(null);
  const [nameMatches, setNameMatches] = useState(false);

  // Step 4 state
  const [documentHash, setDocumentHash] = useState<string>("");

  // Step 5 state
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Step 6 state
  const [signatureId, setSignatureId] = useState<string>("");

  // Refs for stable values in async callbacks
  const typedNameRef = useRef(typedName);
  const documentHashRef = useRef(documentHash);
  useEffect(() => { typedNameRef.current = typedName; }, [typedName]);
  useEffect(() => { documentHashRef.current = documentHash; }, [documentHash]);

  // Fetch user profile on mount (for owner_name and email)
  useEffect(() => {
    if (!isOpen) return;

    fetch("/api/onboarding/profile")
      .then((r) => r.json())
      .then((d: { owner_name?: string; email?: string }) => {
        if (d.owner_name) setOwnerName(d.owner_name);
        if (d.email) setUserEmail(d.email);
      })
      .catch(() => {
        // Non-fatal: identity step will still show the input field
      });

    // Pre-compute document hash so step 4 is instant
    computeDocumentHash(CONSULTING_AGREEMENT_TEXT).then((hash) => {
      setDocumentHash(hash);
    });
  }, [isOpen]);

  // Validate typed name against owner_name on each keystroke
  useEffect(() => {
    if (!typedName) {
      setNameMatchError(null);
      setNameMatches(false);
      return;
    }

    if (!ownerName) {
      // If we couldn't fetch owner_name, allow any non-empty name
      setNameMatchError(null);
      setNameMatches(typedName.trim().length > 1);
      return;
    }

    const normalizedTyped = normalizeNFC(typedName);
    const normalizedOwner = normalizeNFC(ownerName);

    if (normalizedTyped.toLowerCase() === normalizedOwner.toLowerCase()) {
      setNameMatchError(null);
      setNameMatches(true);
    } else {
      setNameMatchError(
        `The name entered does not match your account. Please enter: ${ownerName}`
      );
      setNameMatches(false);
    }
  }, [typedName, ownerName]);

  // Reset modal state when closed/reopened
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setHasScrolled(false);
      setAllChecked(false);
      setTypedName("");
      setNameMatchError(null);
      setNameMatches(false);
      setProcessingError(null);
      setSignatureId("");
    }
  }, [isOpen]);

  const handleScrolledToBottom = useCallback(() => {
    setHasScrolled(true);
  }, []);

  const handleCheckboxChange = useCallback((checked: boolean) => {
    setAllChecked(checked);
  }, []);

  async function handleProcessSignature() {
    setProcessingError(null);

    try {
      const fingerprintHash = await generateFingerprint();
      const currentDocHash = documentHashRef.current;
      const currentName = normalizeNFC(typedNameRef.current);

      const res = await fetch("/api/signature/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_type: documentType,
          signed_name: currentName,
          document_hash: currentDocHash,
          device_fingerprint_hash: fingerprintHash,
          user_agent: navigator.userAgent.slice(0, 500),
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Signature processing failed");
      }

      const data = await res.json() as { signature_id?: string };
      if (!data.signature_id) {
        throw new Error("No signature ID returned from server");
      }

      setSignatureId(data.signature_id);
      setStep(6);
    } catch (err) {
      setProcessingError(
        err instanceof Error
          ? err.message
          : "Signature processing failed. Please try again."
      );
    }
  }

  if (!isOpen) return null;

  const progressPercent = ((step - 1) / 5) * 100;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Electronic Signature"
    >
      {/* Dark overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={step !== 5 ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 w-full max-w-2xl bg-[#0A1628] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold font-heading text-white">
              Electronic Signature
            </h2>
            <p className="text-xs text-[#C9A84C] font-body mt-0.5">
              {STEP_LABELS[step]}
            </p>
          </div>
          {step !== 5 && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
              aria-label="Close signature modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/10 flex-shrink-0">
          <div
            className="h-full bg-[#C9A84C] transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Signature process progress"
          />
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {/* ── Step 1: Document Display ──────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 font-body">
                Please read the full agreement below. You must scroll to the bottom
                before continuing.
              </p>
              <AgreementViewer
                text={CONSULTING_AGREEMENT_TEXT}
                onScrolledToBottom={handleScrolledToBottom}
              />
            </div>
          )}

          {/* ── Step 2: Acknowledgments ───────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 font-body">
                Please confirm each of the following acknowledgments by checking
                all boxes below.
              </p>
              <CheckboxList
                items={ACKNOWLEDGMENT_CHECKBOXES}
                onChange={handleCheckboxChange}
                disabled={false}
              />
            </div>
          )}

          {/* ── Step 3: Identity Verification ────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 font-body mb-1">
                  Email Address (from your account)
                </label>
                <input
                  type="email"
                  value={userEmail}
                  readOnly
                  className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/15 text-gray-400 text-sm font-body cursor-not-allowed"
                  aria-label="Email address (read-only)"
                />
              </div>

              <div>
                <label
                  htmlFor="sig-name-input"
                  className="block text-sm font-medium text-white font-body mb-1"
                >
                  Enter your full legal name exactly as it appears on your business registration:
                </label>
                <input
                  id="sig-name-input"
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Full legal name"
                  autoComplete="name"
                  className={`w-full px-4 py-2.5 rounded-lg bg-white/5 border text-white text-sm font-body transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 ${
                    nameMatchError
                      ? "border-red-500/60"
                      : nameMatches
                      ? "border-green-500/50"
                      : "border-white/20"
                  }`}
                  aria-describedby={nameMatchError ? "name-error" : undefined}
                />

                {/* Live Dancing Script preview */}
                {typedName && (
                  <div
                    className="mt-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-center"
                    aria-live="polite"
                    aria-label="Signature preview"
                  >
                    <p className="text-xs text-gray-500 font-body mb-1">Preview</p>
                    <p
                      className="text-2xl text-white"
                      style={{ fontFamily: "var(--font-dancing), cursive" }}
                    >
                      {typedName}
                    </p>
                  </div>
                )}

                {nameMatchError && (
                  <p
                    id="name-error"
                    role="alert"
                    className="mt-2 text-xs text-red-400 font-body"
                  >
                    {nameMatchError}
                  </p>
                )}

                {nameMatches && (
                  <p className="mt-2 text-xs text-green-400 font-body">
                    Identity verified
                  </p>
                )}
              </div>

              <p className="text-xs text-gray-500 font-body">
                Document version: {CONSULTING_AGREEMENT_VERSION}
              </p>
            </div>
          )}

          {/* ── Step 4: Signature Preview ─────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-gray-400 font-body mb-2 uppercase tracking-widest">
                  Your Electronic Signature
                </p>
                <div className="px-8 py-6 rounded-xl bg-white/5 border border-[#C9A84C]/30 inline-block min-w-[300px]">
                  <p
                    className="text-4xl text-white"
                    style={{ fontFamily: "var(--font-dancing), cursive" }}
                    aria-label={`Signature: ${typedName}`}
                  >
                    {typedName}
                  </p>
                </div>
              </div>

              <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-body">
                  <span className="text-gray-400">Document</span>
                  <span className="text-gray-200">
                    Business Consulting & Capital Advisory Agreement {CONSULTING_AGREEMENT_VERSION}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-body">
                  <span className="text-gray-400">Document Hash</span>
                  <span className="text-gray-300 font-mono">
                    {documentHash.slice(0, 16)}…
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-body">
                  <span className="text-gray-400">Signed by</span>
                  <span className="text-gray-200">{userEmail}</span>
                </div>
              </div>

              <div className="rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/25 px-4 py-3">
                <p className="text-sm text-gray-200 font-body text-center leading-relaxed">
                  I agree — this constitutes my legal electronic signature under the
                  E-SIGN Act (15 U.S.C. § 7001) and Alabama UETA.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 5: Processing ────────────────────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              {processingError ? (
                <>
                  <div
                    role="alert"
                    className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-body text-center max-w-sm"
                  >
                    {processingError}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProcessingError(null);
                      handleProcessSignature();
                    }}
                    className="px-6 py-2.5 rounded-lg bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] transition-colors"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  {/* Spinner */}
                  <div
                    className="w-12 h-12 rounded-full border-4 border-white/10 border-t-[#C9A84C] animate-spin"
                    role="status"
                    aria-label="Processing signature"
                  />
                  <p className="text-base text-white font-body font-medium">
                    Processing your signature…
                  </p>
                  <p className="text-xs text-gray-400 font-body">
                    Generating executed PDF and sending copies. Please wait.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Step 6: Confirmation ──────────────────────────────────────── */}
          {step === 6 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-5 text-center">
              {/* Green checkmark */}
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <h3 className="text-xl font-bold font-heading text-white mb-1">
                  Agreement Executed
                </h3>
                <p className="text-sm text-gray-300 font-body">
                  Your agreement has been executed and filed.
                </p>
              </div>

              <div className="rounded-lg bg-white/5 border border-white/10 px-5 py-3 space-y-2 w-full max-w-sm">
                <p className="text-xs text-gray-400 font-body">
                  Copies have been sent to your email and Cosby Capital.
                </p>
                {signatureId && (
                  <div className="flex items-center justify-between text-xs font-body pt-1">
                    <span className="text-gray-400">Document ID</span>
                    <span className="text-gray-200 font-mono">
                      {signatureId.slice(0, 8)}…
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 font-body max-w-xs">
                This electronic signature was executed under the E-SIGN Act
                (15 U.S.C. § 7001) and Alabama UETA. A copy has been archived
                in your account.
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!hasScrolled}
              className="w-full py-3 rounded-xl bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {hasScrolled ? "Continue to Sign →" : "Scroll to read the agreement"}
            </button>
          )}

          {step === 2 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3 rounded-xl border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!allChecked}
                className="flex-1 py-3 rounded-xl bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue →
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-3 rounded-xl border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                disabled={!nameMatches}
                className="flex-1 py-3 rounded-xl bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continue →
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-3 rounded-xl border border-white/20 text-gray-300 text-sm font-body hover:border-white/40 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(5);
                  handleProcessSignature();
                }}
                className="flex-1 py-3 rounded-xl bg-[#0A1628] border border-[#C9A84C] text-[#C9A84C] font-semibold font-body text-sm hover:bg-[#C9A84C] hover:text-[#0A1628] transition-colors"
              >
                Click to Sign
              </button>
            </div>
          )}

          {step === 5 && !processingError && (
            <p className="text-xs text-gray-500 font-body text-center">
              Please do not close this window while processing.
            </p>
          )}

          {step === 6 && (
            <button
              type="button"
              onClick={() => onComplete(signatureId)}
              className="w-full py-3 rounded-xl bg-[#C9A84C] text-[#0A1628] font-semibold font-body text-sm hover:bg-[#d4b568] transition-colors"
            >
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
