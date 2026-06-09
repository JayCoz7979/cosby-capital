"use client";

/**
 * Verify Email page — shown after signup.
 * Polls Supabase session every 5 seconds and redirects to onboarding on verification.
 *
 * Features:
 * - Displays the email address from query param
 * - Resend button with 60-second rate limit
 * - "Wrong email?" link back to signup
 * - Auto-polls for email verification every 5 seconds
 * - Redirects to /onboarding/step-1 on verified
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const POLL_INTERVAL_MS = 5000;
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for email verification every 5 seconds
  useEffect(() => {
    const supabase = createBrowserClient();

    async function checkVerification() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (user?.email_confirmed_at) {
          // Email verified — redirect to onboarding
          if (pollRef.current) clearInterval(pollRef.current);
          router.push("/onboarding/step-1");
        }
      } catch {
        // Silent — polling should not surface errors to the user
      }
    }

    // Initial check immediately
    void checkVerification();

    // Then poll every 5 seconds
    pollRef.current = setInterval(checkVerification, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [router]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || !email) return;

    setResendLoading(true);
    setResendError(null);
    setResendSuccess(false);

    try {
      const supabase = createBrowserClient();

      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setResendError("Failed to resend verification email. Please try again.");
      } else {
        setResendSuccess(true);
        // Start cooldown
        setResendCooldown(RESEND_COOLDOWN_S);
        const interval = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch {
      setResendError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  }, [email, resendCooldown]);

  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c)
    : "your email address";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We sent a verification link to{" "}
          <span className="font-medium text-[#0A1628]">{maskedEmail}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Status indicator */}
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-500 animate-pulse"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800 font-body">
                Waiting for email verification
              </p>
              <p className="text-xs text-blue-600 font-body mt-0.5">
                Click the link in the email to continue. This page will
                automatically redirect you.
              </p>
            </div>
          </div>
        </div>

        {/* Resend feedback */}
        {resendSuccess && (
          <div
            role="status"
            className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-body"
          >
            Verification email resent. Check your inbox (and spam folder).
          </div>
        )}
        {resendError && (
          <div
            role="alert"
            className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
          >
            {resendError}
          </div>
        )}

        {/* Resend button */}
        <div className="space-y-3">
          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={handleResend}
            loading={resendLoading}
            disabled={resendLoading || resendCooldown > 0 || !email}
          >
            {resendLoading
              ? "Sending…"
              : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : "Resend verification email"}
          </Button>

          <p className="text-center text-sm text-gray-500 font-body">
            Wrong email?{" "}
            <Link
              href="/auth/signup"
              className="text-[#C9A84C] hover:underline font-medium"
            >
              Go back to sign up
            </Link>
          </p>
        </div>

        {/* Help text */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400 font-body text-center">
            Didn&apos;t receive the email? Check your spam folder or make sure
            you entered the correct email address.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
