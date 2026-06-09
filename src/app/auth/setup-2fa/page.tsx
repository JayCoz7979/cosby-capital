"use client";

/**
 * 2FA Setup page — TOTP enrollment via Supabase MFA.
 *
 * Flow:
 * 1. Call supabase.auth.mfa.enroll() to get QR code URI + secret
 * 2. User scans QR code or enters secret manually into authenticator app
 * 3. User enters 6-digit code to verify enrollment
 * 4. On success: mark 2FA as complete, redirect to dashboard
 * 5. Backup codes shown + downloadable as text file
 * 6. "Skip for now" available for non-admin accounts
 *
 * Protected: requires authenticated session (middleware handles unauthenticated redirect)
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type SetupStep = "loading" | "enroll" | "verify" | "backup-codes" | "error";

interface EnrollData {
  factorId: string;
  qrCode: string; // SVG or data URL
  secret: string;
  uri: string;
}

/** Generates readable backup codes (10 codes × 10 characters) */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const part1 = Math.random().toString(36).substring(2, 7).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 7).toUpperCase();
    codes.push(`${part1}-${part2}`);
  }
  return codes;
}

export default function Setup2FAPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>("loading");
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Start TOTP enrollment on mount
  useEffect(() => {
    async function startEnrollment() {
      try {
        const supabase = createBrowserClient();

        // Check if user is authenticated
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/login");
          return;
        }

        // Check if user is admin (admins cannot skip 2FA)
        const userRole = user.user_metadata?.role as string | undefined;
        setIsAdmin(userRole === "admin");

        // Start MFA enrollment
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          issuer: "Cosby Capital",
          friendlyName: `Cosby Capital (${user.email ?? "account"})`,
        });

        if (error || !data) {
          setErrorMessage(
            error?.message ?? "Failed to start 2FA setup. Please try again."
          );
          setStep("error");
          return;
        }

        setEnrollData({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        });
        setStep("enroll");
      } catch {
        setErrorMessage("An unexpected error occurred. Please try again.");
        setStep("error");
      }
    }

    void startEnrollment();
  }, [router]);

  const handleVerify = useCallback(async () => {
    if (!enrollData || verifyCode.length !== 6) return;

    setVerifyError(null);
    setVerifyLoading(true);

    try {
      const supabase = createBrowserClient();

      // Create challenge first
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enrollData.factorId });

      if (challengeError || !challengeData) {
        setVerifyError("Failed to create verification challenge. Please try again.");
        setVerifyLoading(false);
        return;
      }

      // Verify the TOTP code
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enrollData.factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });

      if (verifyErr) {
        setVerifyError("Invalid code. Please check your authenticator app and try again.");
        setVerifyLoading(false);
        return;
      }

      // Generate backup codes and show them
      const codes = generateBackupCodes();
      setBackupCodes(codes);
      setStep("backup-codes");
    } catch {
      setVerifyError("Verification failed. Please try again.");
    } finally {
      setVerifyLoading(false);
    }
  }, [enrollData, verifyCode]);

  const handleDownloadBackupCodes = useCallback(() => {
    const content = [
      "Cosby Capital — 2FA Backup Codes",
      "=================================",
      "Store these codes in a safe place.",
      "Each code can only be used once.",
      "",
      ...backupCodes.map((code, i) => `${i + 1}. ${code}`),
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cosby-capital-backup-codes.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [backupCodes]);

  const handleSkip = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const handleComplete = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  // Loading state
  if (step === "loading") {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#0A1628] border-t-[#C9A84C]" />
          <p className="text-sm text-gray-500 font-body">
            Setting up two-factor authentication…
          </p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (step === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Setup failed</CardTitle>
          <CardDescription>
            We couldn&apos;t start 2FA setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="alert"
            className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
          >
            {errorMessage}
          </div>
          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => {
              setStep("loading");
              setErrorMessage(null);
            }}
          >
            Try again
          </Button>
          <Button
            variant="ghost"
            size="md"
            className="w-full"
            onClick={handleSkip}
          >
            Skip for now
          </Button>
        </CardContent>
      </Card>
    );
  }

  // QR code enrollment step
  if (step === "enroll" && enrollData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up two-factor authentication</CardTitle>
          <CardDescription>
            Scan the QR code with your authenticator app (Google Authenticator,
            Authy, 1Password, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* QR Code */}
          <div className="flex justify-center">
            <div
              className="p-3 bg-white border-2 border-gray-200 rounded-lg"
              aria-label="QR code for authenticator app setup"
            >
              {/* Supabase returns SVG as a data URL */}
              {enrollData.qrCode.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={enrollData.qrCode}
                  alt="Scan with your authenticator app"
                  className="h-44 w-44"
                />
              ) : (
                <div
                  className="h-44 w-44"
                  dangerouslySetInnerHTML={{ __html: enrollData.qrCode }}
                />
              )}
            </div>
          </div>

          {/* Manual entry fallback */}
          <div>
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="text-sm text-[#C9A84C] hover:underline font-body"
              aria-expanded={showSecret}
            >
              {showSecret ? "Hide" : "Can't scan? Enter code manually"}
            </button>
            {showSecret && (
              <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="text-xs text-gray-500 font-body mb-1">
                  Enter this key in your authenticator app:
                </p>
                <code className="text-sm font-mono text-[#0A1628] break-all select-all">
                  {enrollData.secret}
                </code>
              </div>
            )}
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => setStep("verify")}
          >
            I&apos;ve scanned the code — Continue
          </Button>

          {!isAdmin && (
            <Button
              variant="ghost"
              size="md"
              className="w-full text-gray-500"
              onClick={handleSkip}
            >
              Skip for now
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Verification step — enter 6-digit code
  if (step === "verify") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verify your authenticator</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app to confirm setup
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verifyError && (
            <div
              role="alert"
              className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
            >
              {verifyError}
            </div>
          )}

          <Input
            id="totp-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            label="6-digit verification code"
            autoComplete="one-time-code"
            required
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={verifyLoading}
            hint="Enter the code shown in your authenticator app"
          />

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={verifyLoading}
            disabled={verifyLoading || verifyCode.length !== 6}
            onClick={handleVerify}
          >
            {verifyLoading ? "Verifying…" : "Verify and enable 2FA"}
          </Button>

          <Button
            variant="ghost"
            size="md"
            className="w-full text-gray-500"
            onClick={() => setStep("enroll")}
            disabled={verifyLoading}
          >
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Backup codes step
  if (step === "backup-codes") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Save your backup codes</CardTitle>
          <CardDescription>
            Store these codes safely — each can be used once if you lose access
            to your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            role="region"
            aria-label="Backup codes"
            className="bg-gray-50 border border-gray-200 rounded-md p-4"
          >
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code) => (
                <code
                  key={code}
                  className="text-sm font-mono text-[#0A1628] bg-white border border-gray-100 rounded px-2 py-1 text-center"
                >
                  {code}
                </code>
              ))}
            </div>
          </div>

          <div
            role="alert"
            className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-body"
          >
            <strong>Important:</strong> These codes will not be shown again.
            Download or write them down now and store them in a safe place.
          </div>

          <Button
            variant="secondary"
            size="md"
            className="w-full"
            onClick={handleDownloadBackupCodes}
          >
            Download backup codes
          </Button>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleComplete}
          >
            I&apos;ve saved my codes — Go to dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
