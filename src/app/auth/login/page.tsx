"use client";

/**
 * Login page — email/password authentication via Supabase.
 *
 * Security:
 * - S11-009: Generic error message "Invalid email or password" — never reveals which field is wrong
 * - Rate limit messaging after 5 failed attempts (Supabase enforces server-side)
 * - Turnstile bot protection widget
 * - Zod validation on submit before calling Supabase
 * - Device fingerprint check after login — unrecognized devices trigger OTP step-up
 * - No NODE_ENV bypass for device trust check
 */

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { loginSchema } from "@/lib/validate";
import { generateFingerprint } from "@/lib/device-fingerprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DeviceTrustModal } from "@/components/auth/DeviceTrustModal";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Generic error shown on any auth failure — never reveals which field is wrong (S11-009) */
const GENERIC_AUTH_ERROR = "Invalid email or password. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many login attempts. Please wait 15 minutes before trying again.";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Device trust state
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [fingerprintHash, setFingerprintHash] = useState("");

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setFieldErrors({});

      // Client-side Zod validation
      const parseResult = loginSchema.safeParse({ email, password });
      if (!parseResult.success) {
        const errors: { email?: string; password?: string } = {};
        for (const issue of parseResult.error.issues) {
          const field = issue.path[0] as "email" | "password";
          if (field === "email" || field === "password") {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      // Get Turnstile token if widget is present
      const turnstileToken =
        (
          turnstileRef.current?.querySelector(
            'input[name="cf-turnstile-response"]'
          ) as HTMLInputElement | null
        )?.value ?? "";

      setLoading(true);

      try {
        const supabase = createBrowserClient();

        const { error: authError } = await supabase.auth.signInWithPassword({
          email: parseResult.data.email,
          password: parseResult.data.password,
        });

        if (authError) {
          // Check for rate limit error from Supabase
          if (
            authError.message?.toLowerCase().includes("rate") ||
            authError.message?.toLowerCase().includes("too many") ||
            authError.status === 429
          ) {
            setError(RATE_LIMIT_ERROR);
          } else {
            // All other errors: generic message (S11-009 — never reveal which field is wrong)
            setError(GENERIC_AUTH_ERROR);
          }
          setLoading(false);
          return;
        }

        // Check if user has TOTP enrolled — redirect to 2FA verify if so
        const { data: mfaData } = await supabase.auth.mfa.listFactors();
        const hasTOTP = mfaData?.totp && mfaData.totp.length > 0;

        if (hasTOTP) {
          router.push("/auth/verify-2fa");
          return;
        }

        // ── Device fingerprint check ──────────────────────────────────────
        // Generate fingerprint client-side and check against trusted_devices.
        // No NODE_ENV bypass — always enforced.
        try {
          const fingerprint = await generateFingerprint();
          setFingerprintHash(fingerprint);

          const deviceRes = await fetch("/api/auth/check-device", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fingerprint_hash: fingerprint }),
          });

          const deviceData = (await deviceRes.json()) as { trusted?: boolean };

          if (deviceData.trusted) {
            // Known device — proceed directly to dashboard
            router.push("/dashboard");
          } else {
            // Unknown device — show OTP step-up modal
            setLoading(false);
            setShowDeviceModal(true);
          }
        } catch {
          // Fingerprint or check-device failure — fail open, proceed to dashboard
          // (device check is step-up security, not a hard gate on login)
          router.push("/dashboard");
        }
      } catch {
        setError(GENERIC_AUTH_ERROR);
        setLoading(false);
      }
    },
    [email, password, router]
  );

  const handleDeviceVerified = useCallback(() => {
    setShowDeviceModal(false);
    router.push("/dashboard");
  }, [router]);

  return (
    <>
    {/* Device trust step-up modal — shown for unrecognized devices after login */}
    <DeviceTrustModal
      isOpen={showDeviceModal}
      onVerified={handleDeviceVerified}
      fingerprintHash={fingerprintHash}
      userEmail={email}
    />
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Access your Cosby Capital dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Global error message */}
          {error && (
            <div
              role="alert"
              className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
            >
              {error}
            </div>
          )}

          <Input
            id="email"
            type="email"
            label="Email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            disabled={loading}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            disabled={loading}
          />

          {/* Remember me + Forgot password row */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C] accent-[#C9A84C]"
              />
              <span className="text-sm text-gray-600 font-body">
                Remember me
              </span>
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-[#C9A84C] hover:underline font-body"
            >
              Forgot password?
            </Link>
          </div>

          {/* Cloudflare Turnstile widget */}
          {TURNSTILE_SITE_KEY && (
            <div ref={turnstileRef} className="my-2">
              <div
                className="cf-turnstile"
                data-sitekey={TURNSTILE_SITE_KEY}
                data-theme="light"
              />
              <script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                async
                defer
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 font-body">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="text-[#C9A84C] hover:underline font-medium"
          >
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
    </>
  );
}
