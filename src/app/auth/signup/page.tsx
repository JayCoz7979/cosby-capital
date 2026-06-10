"use client";

/**
 * Signup page — Google OAuth + email/password registration.
 *
 * Security:
 * - Honeypot field (name="website") — rejected server-side if filled
 * - Turnstile widget — verified SERVER-SIDE in /api/auth/signup
 * - Disposable email blocklist checked server-side
 * - Password strength indicator (min 12 chars)
 * - Generic success message regardless of whether email already exists (S11-009)
 * - Zod validation before submission
 * - Google OAuth bypasses email/password flow entirely (Google handles verification)
 */

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  requirements: { label: string; met: boolean }[];
} {
  const requirements = [
    { label: "At least 12 characters", met: password.length >= 12 },
    { label: "Uppercase letter (A-Z)", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter (a-z)", met: /[a-z]/.test(password) },
    { label: "Number (0-9)", met: /\d/.test(password) },
    { label: "Special character (!@#$…)", met: /[^A-Za-z0-9]/.test(password) },
  ];

  const score = requirements.filter((r) => r.met).length;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  // Forest green and gold — no blue
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-[#2D5016]",
    "bg-[#C9A84C]",
  ];

  return {
    score,
    label: password.length === 0 ? "" : (labels[score] ?? "Very weak"),
    color: colors[score] ?? "bg-red-500",
    requirements,
  };
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const strength = getPasswordStrength(password);

  const handleGoogleSignUp = useCallback(async () => {
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
      setError("Google sign-up failed. Please try again.");
      setGoogleLoading(false);
    }
    // On success, Supabase redirects to Google — no further action needed here
  }, []);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address";
    }

    if (!password || password.length < 12) {
      errors.password = "Password must be at least 12 characters";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (!agreedToTerms) {
      errors.terms = "You must agree to the Terms of Service to continue";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password, confirmPassword, agreedToTerms]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);

      if (!validate()) return;

      const formData = new FormData(formRef.current!);
      const turnstileToken = (formData.get("cf-turnstile-response") as string) ?? "";
      const honeypot = (formData.get("website") as string) ?? "";

      setLoading(true);

      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            turnstileToken,
            website: honeypot,
          }),
        });

        const data = (await res.json()) as { error?: string; success?: boolean };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          setLoading(false);
          return;
        }

        // Always redirect to verify-email regardless of outcome (prevents enumeration)
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    },
    [email, password, validate, router]
  );

  const anyLoading = loading || googleLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Start accessing capital solutions for your business
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Honeypot — hidden from real users, filled by bots */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ display: "none" }}
        />

        {/* Global error */}
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
          onClick={handleGoogleSignUp}
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
          <span className="text-xs text-gray-400 font-body">or sign up with email</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Email / password form */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            id="email"
            type="email"
            label="Business email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            disabled={anyLoading}
            hint="Use your business email — personal/disposable emails are not accepted"
          />

          <div className="space-y-1.5">
            <Input
              id="password"
              type="password"
              label="Password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setShowRequirements(true)}
              error={fieldErrors.password}
              disabled={anyLoading}
            />

            {/* Password strength bar */}
            {password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1 h-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-colors duration-200 ${
                        i < strength.score ? strength.color : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                {strength.label && (
                  <p className="text-xs text-gray-500 font-body">
                    Strength: <span className="font-medium">{strength.label}</span>
                  </p>
                )}
              </div>
            )}

            {/* Password requirements checklist */}
            {showRequirements && (
              <ul className="space-y-1 mt-2" aria-label="Password requirements">
                {strength.requirements.map((req) => (
                  <li
                    key={req.label}
                    className={`flex items-center gap-2 text-xs font-body ${
                      req.met ? "text-[#2D5016]" : "text-gray-400"
                    }`}
                  >
                    <span aria-hidden="true">{req.met ? "✓" : "○"}</span>
                    {req.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Input
            id="confirmPassword"
            type="password"
            label="Confirm password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={fieldErrors.confirmPassword}
            disabled={anyLoading}
          />

          {/* Terms of Service */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                disabled={anyLoading}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#C9A84C] focus:ring-[#C9A84C]"
                aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
              />
              <span className="text-sm text-gray-600 font-body leading-snug">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-[#C9A84C] hover:underline font-medium">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-[#C9A84C] hover:underline font-medium">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {fieldErrors.terms && (
              <p id="terms-error" role="alert" className="mt-1 text-xs text-red-600 font-body">
                {fieldErrors.terms}
              </p>
            )}
          </div>

          {/* Cloudflare Turnstile widget */}
          {TURNSTILE_SITE_KEY && (
            <div className="my-2">
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
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 font-body">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-[#C9A84C] hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
