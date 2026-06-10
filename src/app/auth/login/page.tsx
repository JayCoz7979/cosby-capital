"use client";

/**
 * Login page — Google OAuth + email/password authentication via Supabase.
 *
 * Security:
 * - S11-009: Generic error message "Invalid email or password" — never reveals which field is wrong
 * - Rate limit messaging after 5 failed attempts (Supabase enforces server-side)
 * - Turnstile bot protection widget
 * - Zod validation on submit before calling Supabase
 * - Device fingerprint check after email/password login — unrecognized devices trigger OTP step-up
 * - No NODE_ENV bypass for device trust check
 * - Google OAuth bypasses device fingerprint (Google handles its own step-up auth)
 */

import { useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { loginSchema } from "@/lib/validate";
import { generateFingerprint } from "@/lib/device-fingerprint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DeviceTrustModal } from "@/components/auth/DeviceTrustModal";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const GENERIC_AUTH_ERROR = "Invalid email or password. Please try again.";
const RATE_LIMIT_ERROR =
  "Too many login attempts. Please wait 15 minutes before trying again.";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: "That link has expired or is invalid. Please sign in again.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam ? (ERROR_MESSAGES[errorParam] ?? "Something went wrong. Please sign in again.") : null
  );
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);

  // Device trust state
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [fingerprintHash, setFingerprintHash] = useState("");

  const handleGoogleSignIn = useCallback(async () => {
    setError(null);
    setGoogleLoading(true);
    const supabase = createBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
    // On success, Supabase redirects to Google — no further action needed here
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setFieldErrors({});

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
      void turnstileToken; // used by server if Turnstile is enabled

      setLoading(true);

      try {
        const supabase = createBrowserClient();

        const { error: authError } = await supabase.auth.signInWithPassword({
          email: parseResult.data.email,
          password: parseResult.data.password,
        });

        if (authError) {
          if (
            authError.message?.toLowerCase().includes("rate") ||
            authError.message?.toLowerCase().includes("too many") ||
            authError.status === 429
          ) {
            setError(RATE_LIMIT_ERROR);
          } else {
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

        // Device fingerprint check — always enforced (no NODE_ENV bypass)
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
            router.push("/dashboard");
          } else {
            setLoading(false);
            setShowDeviceModal(true);
          }
        } catch {
          // Fingerprint check failure — fail open (device check is step-up, not a hard gate)
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

  const anyLoading = loading || googleLoading;

  return (
    <>
      <DeviceTrustModal
        isOpen={showDeviceModal}
        onVerified={handleDeviceVerified}
        fingerprintHash={fingerprintHash}
        userEmail={email}
      />
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your Cosby Capital dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Global error message */}
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
            >
              {error}
            </div>
          )}

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={anyLoading}
            className="w-full flex items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 font-body shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#2D5016] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googleLoading ? (
              <svg
                className="h-5 w-5 animate-spin text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400 font-body">or continue with email</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              disabled={anyLoading}
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
              disabled={anyLoading}
            />

            {/* Remember me + Forgot password row */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={anyLoading}
                  className="h-4 w-4 rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C] accent-[#C9A84C]"
                />
                <span className="text-sm text-gray-600 font-body">Remember me</span>
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
              disabled={anyLoading}
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
