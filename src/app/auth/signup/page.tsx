"use client";

/**
 * Signup page — business email + password registration.
 *
 * Security:
 * - Honeypot field (name="website") — rejected server-side if filled
 * - Turnstile widget — verified SERVER-SIDE in /api/auth/signup
 * - Disposable email blocklist checked server-side
 * - Password strength indicator (min 12 chars)
 * - Generic success message regardless of whether email already exists (S11-009)
 * - Zod validation before submission
 */

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Password strength scoring */
function getPasswordStrength(password: string): {
  score: number; // 0-4
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
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-blue-500",
    "bg-green-500",
  ];

  return {
    score,
    label: password.length === 0 ? "" : labels[score] ?? "Very weak",
    color: colors[score] ?? "bg-red-500",
    requirements,
  };
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
  const [showRequirements, setShowRequirements] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const strength = getPasswordStrength(password);

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

      // Get Turnstile token from the form
      const formData = new FormData(formRef.current!);
      const turnstileToken = formData.get("cf-turnstile-response") as string ?? "";
      // Honeypot — if "website" field has a value, silently appear to succeed
      const honeypot = formData.get("website") as string ?? "";

      setLoading(true);

      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            turnstileToken,
            website: honeypot, // honeypot value sent to server for checking
          }),
        });

        const data = (await res.json()) as { error?: string; success?: boolean };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          setLoading(false);
          return;
        }

        // Always redirect to verify-email regardless of outcome (prevents enumeration)
        router.push(
          `/auth/verify-email?email=${encodeURIComponent(email)}`
        );
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    },
    [email, password, validate, router]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Start accessing capital solutions for your business
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
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
              className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
            >
              {error}
            </div>
          )}

          <Input
            id="email"
            type="email"
            label="Business email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            disabled={loading}
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
              disabled={loading}
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
                      req.met ? "text-green-600" : "text-gray-400"
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
            disabled={loading}
          />

          {/* Terms of Service */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#C9A84C] focus:ring-[#C9A84C]"
                aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
              />
              <span className="text-sm text-gray-600 font-body leading-snug">
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-[#C9A84C] hover:underline font-medium"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-[#C9A84C] hover:underline font-medium"
                >
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
            disabled={loading}
            className="w-full"
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500 font-body">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-[#C9A84C] hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
