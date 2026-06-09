"use client";

/**
 * Forgot Password page — constant-time response (S11-009, S16-002).
 *
 * Security:
 * - ALWAYS returns success regardless of whether email exists (prevents enumeration)
 * - 200ms artificial delay on both code paths (makes timing attacks harder)
 * - Zod email validation before submission
 * - Rate limit: handled by Supabase + client-side cooldown display
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const emailSchema = z.string().email().max(254);

/** Constant success message shown regardless of whether email exists (S11-009) */
const SUCCESS_MESSAGE =
  "If an account exists with that email, you'll receive a password reset link within a few minutes. Check your spam folder if you don't see it.";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setEmailError(null);

      // Client-side email validation
      const parseResult = emailSchema.safeParse(email);
      if (!parseResult.success) {
        setEmailError("Please enter a valid email address.");
        return;
      }

      if (cooldown > 0) return;

      setLoading(true);

      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: parseResult.data }),
        });

        // Always show success regardless of response (client-side enumeration prevention)
        // The server also enforces this — double defence
        void res;
        setSubmitted(true);

        // Start 60-second cooldown before allowing another request
        setCooldown(60);
        const interval = setInterval(() => {
          setCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch {
        // Even on network error, show generic success (don't leak info)
        setSubmitted(true);
      } finally {
        setLoading(false);
      }
    },
    [email, cooldown]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="space-y-4">
            <div
              role="status"
              className="rounded-md bg-green-50 border border-green-200 px-4 py-4 text-sm text-green-800 font-body"
            >
              {SUCCESS_MESSAGE}
            </div>

            {cooldown > 0 && (
              <p className="text-xs text-gray-500 font-body text-center">
                You can request another link in {cooldown}s
              </p>
            )}

            <div className="flex flex-col gap-2 mt-2">
              {cooldown === 0 && (
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full"
                  onClick={() => setSubmitted(false)}
                >
                  Send another link
                </Button>
              )}
              <Link
                href="/auth/login"
                className="text-center text-sm text-[#C9A84C] hover:underline font-body"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError ?? undefined}
              disabled={loading}
              hint="Enter the email address associated with your account"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={loading || cooldown > 0}
              className="w-full"
            >
              {loading
                ? "Sending…"
                : cooldown > 0
                ? `Wait ${cooldown}s`
                : "Send reset link"}
            </Button>

            <p className="text-center text-sm text-gray-500 font-body">
              <Link
                href="/auth/login"
                className="text-[#C9A84C] hover:underline"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
