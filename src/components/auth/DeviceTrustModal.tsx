"use client";

/**
 * DeviceTrustModal — Step-up authentication modal for unrecognized devices.
 *
 * Shown after successful login when the device fingerprint is not in trusted_devices.
 * Automatically sends an OTP on open, allows resend with 60s cooldown,
 * and calls onVerified() when the 6-digit code is confirmed.
 *
 * Security:
 * - OTP input is numeric only (no clipboard paste of arbitrary text)
 * - Error messages are generic — do not reveal internal state
 * - Rate limiting is enforced server-side; UI reflects cooldown only
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface DeviceTrustModalProps {
  isOpen: boolean;
  onVerified: () => void;
  fingerprintHash: string;
  /** User email shown in the subtitle (e.g. "code sent to j***@example.com") */
  userEmail?: string;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function DeviceTrustModal({
  isOpen,
  onVerified,
  fingerprintHash,
  userEmail,
}: DeviceTrustModalProps) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-send OTP when modal opens ───────────────────────────────────────
  const sendOtp = useCallback(async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/send-device-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint_hash: fingerprintHash }),
      });

      if (!res.ok && res.status !== 200) {
        // Server always returns { sent: true } — a non-200 is unexpected
        setError("Failed to send verification code. Please try again.");
      } else {
        setSent(true);
        // Start 60-second resend cooldown
        setCooldown(RESEND_COOLDOWN_SECONDS);
        cooldownRef.current = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) {
              if (cooldownRef.current) clearInterval(cooldownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  }, [fingerprintHash, sending, cooldown]);

  // Auto-send on open
  useEffect(() => {
    if (isOpen) {
      setOtp("");
      setError(null);
      setSent(false);
      setCooldown(0);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      sendOtp();
    }

    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-focus input when modal opens and OTP sent
  useEffect(() => {
    if (isOpen && sent) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, sent]);

  // ── OTP input handler ─────────────────────────────────────────────────────
  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only digits, max 6 chars
    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(value);
    setError(null);
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && !verifying) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    if (otp.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-device-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otp,
          fingerprint_hash: fingerprintHash,
          device_name: getDeviceName(),
        }),
      });

      const data = (await res.json()) as { trusted?: boolean; error?: string };

      if (res.status === 429) {
        setError("Too many attempts. Please request a new code.");
        setOtp("");
        return;
      }

      if (!res.ok || !data.trusted) {
        setError(data.error ?? "Invalid code. Please try again.");
        setOtp("");
        inputRef.current?.focus();
        return;
      }

      // Success — call parent callback
      onVerified();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setOtp("");
    } finally {
      setVerifying(false);
    }
  }, [otp, fingerprintHash, verifying, onVerified]);

  // Masked email display (e.g. "j***@example.com")
  const maskedEmail = userEmail
    ? maskEmail(userEmail)
    : "your registered email";

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />

        {/* Modal panel */}
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl focus:outline-none"
          onInteractOutside={(e) => e.preventDefault()} // Prevent dismissal — user must verify
          onEscapeKeyDown={(e) => e.preventDefault()}   // Prevent ESC dismissal
          aria-describedby="device-trust-description"
        >
          {/* Header bar */}
          <div className="rounded-t-xl bg-[#0f1117] px-6 py-4">
            <Dialog.Title className="text-sm font-semibold uppercase tracking-widest text-[#C9A84C]">
              New Device Detected
            </Dialog.Title>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <p
              id="device-trust-description"
              className="mb-6 text-sm text-gray-600 leading-relaxed"
            >
              A verification code has been sent to{" "}
              <span className="font-medium text-gray-900">{maskedEmail}</span>.
              Enter it below to confirm this device.
            </p>

            {/* OTP input */}
            <div className="mb-4">
              <label
                htmlFor="otp-input"
                className="mb-2 block text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Verification code
              </label>
              <input
                ref={inputRef}
                id="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={handleOtpChange}
                disabled={verifying || sending}
                placeholder="000000"
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-gray-900 placeholder-gray-300 focus:border-[#C9A84C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 disabled:opacity-50"
              />
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            {/* Sending indicator */}
            {sending && (
              <p className="mb-4 text-center text-sm text-gray-500">
                Sending verification code&hellip;
              </p>
            )}

            {/* Verify button */}
            <button
              type="button"
              onClick={handleVerify}
              disabled={otp.length !== 6 || verifying || sending}
              className="mb-3 w-full rounded-lg bg-[#C9A84C] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {verifying ? "Verifying…" : "Verify Device"}
            </button>

            {/* Resend button */}
            <div className="text-center">
              {cooldown > 0 ? (
                <p className="text-sm text-gray-400">
                  Resend code in{" "}
                  <span className="font-medium text-gray-600">{cooldown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={sending || verifying}
                  className="text-sm text-[#C9A84C] hover:underline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Resend code"}
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-3 text-center">
            <p className="text-xs text-gray-400">
              Powered by{" "}
              <a
                href="https://cosbyaisolutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C9A84C] hover:underline"
              >
                Cosby AI Solutions
              </a>{" "}
              | cosbyaisolutions.com
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a human-readable device name from the browser user agent */
function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Unknown Device";

  const ua = navigator.userAgent;

  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android Device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";

  return "Unknown Device";
}

/** Masks an email address for display: "john.doe@example.com" → "j*****@example.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;

  const visible = local.slice(0, 1);
  const masked = "*".repeat(Math.max(local.length - 1, 3));
  return `${visible}${masked}@${domain}`;
}
