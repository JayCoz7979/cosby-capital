"use client";

/**
 * Step 2 — Funding Goals
 *
 * Collects: funding_goal_amount, funding_purpose, urgency, credit_score_range,
 * has_collateral, has_existing_debt, current_monthly_revenue, desired_funding_amount,
 * primary_obstacle, previous_funding_attempts.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const URGENCY_OPTIONS = [
  "Immediate",
  "Next 30 days",
  "Next 90 days",
  "Next 6 months",
  "Next 12 months",
  "Planning ahead",
];

const CREDIT_SCORE_OPTIONS = [
  "Under 500",
  "500-579",
  "580-619",
  "620-679",
  "680-719",
  "720-779",
  "780+",
  "Not sure",
];

const PRIMARY_OBSTACLE_OPTIONS = [
  { value: "credit", label: "Credit score" },
  { value: "collateral", label: "Lack of collateral" },
  { value: "documentation", label: "Missing documentation" },
  { value: "time", label: "Time in business" },
  { value: "other", label: "Other" },
];

const FUNDING_RANGES = [
  { label: "Under $10K", value: 5000 },
  { label: "$10K–$25K", value: 17500 },
  { label: "$25K–$50K", value: 37500 },
  { label: "$50K–$100K", value: 75000 },
  { label: "$100K–$250K", value: 175000 },
  { label: "$250K–$500K", value: 375000 },
  { label: "$500K–$1M", value: 750000 },
  { label: "$1M–$5M", value: 2500000 },
  { label: "$5M+", value: 5000000 },
];

const MONTHLY_REVENUE_RANGES = [
  { label: "Pre-revenue / $0", value: 0 },
  { label: "Under $5K", value: 2500 },
  { label: "$5K–$10K", value: 7500 },
  { label: "$10K–$25K", value: 17500 },
  { label: "$25K–$50K", value: 37500 },
  { label: "$50K–$100K", value: 75000 },
  { label: "$100K+", value: 100000 },
];

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium font-body text-gray-200">
        {label}
        {required && <span className="text-[#C9A84C] ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 font-body">{hint}</p>}
      {children}
      {error && <p className="text-xs text-red-400 font-body">{error}</p>}
    </div>
  );
}

function RadioGroup({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-4">
      {[
        { label: "Yes", val: true },
        { label: "No", val: false },
      ].map(({ label, val }) => (
        <label
          key={label}
          className={[
            "flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border text-sm font-body transition-colors",
            value === val
              ? "border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]"
              : "border-white/20 text-gray-300 hover:border-white/40",
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <input
            type="radio"
            name={name}
            checked={value === val}
            onChange={() => onChange(val)}
            disabled={disabled}
            className="sr-only"
          />
          {label}
        </label>
      ))}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white font-body placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] disabled:opacity-50";

export default function Step2Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    funding_goal_amount: "",
    funding_purpose: "",
    urgency: "",
    credit_score_range: "",
    has_collateral: undefined as boolean | undefined,
    has_existing_debt: undefined as boolean | undefined,
    current_monthly_revenue: "",
    desired_funding_amount: "",
    primary_obstacle: "",
    previous_funding_attempts: undefined as boolean | undefined,
  });

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        step: 2,
        data: {
          funding_goal_amount: form.funding_goal_amount
            ? parseInt(form.funding_goal_amount)
            : undefined,
          funding_purpose: form.funding_purpose.trim() || undefined,
          urgency: form.urgency || undefined,
          credit_score_range: form.credit_score_range || undefined,
          has_collateral: form.has_collateral,
          has_existing_debt: form.has_existing_debt,
          current_monthly_revenue: form.current_monthly_revenue
            ? parseInt(form.current_monthly_revenue)
            : undefined,
          desired_funding_amount: form.desired_funding_amount
            ? parseInt(form.desired_funding_amount)
            : undefined,
          primary_obstacle: form.primary_obstacle || undefined,
          previous_funding_attempts: form.previous_funding_attempts,
        },
      };

      const res = await fetch("/api/onboarding/save-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Failed to save. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/onboarding/step-3");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-2">
          Funding Goals
        </h2>
        <p className="text-sm text-gray-400 font-body">
          Help us understand your capital needs so we can match you with the right opportunities.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 font-body"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Funding Goal Amount">
            <select
              className={inputCls}
              value={form.funding_goal_amount}
              onChange={(e) => set("funding_goal_amount", e.target.value)}
              disabled={loading}
            >
              <option value="">Select amount range…</option>
              {FUNDING_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Desired Funding Amount">
            <select
              className={inputCls}
              value={form.desired_funding_amount}
              onChange={(e) => set("desired_funding_amount", e.target.value)}
              disabled={loading}
            >
              <option value="">Select amount range…</option>
              {FUNDING_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="What will the funding be used for?"
          hint="Max 500 characters"
        >
          <textarea
            className={inputCls + " resize-none h-24"}
            placeholder="e.g. Purchase equipment, expand to a second location, hire staff…"
            value={form.funding_purpose}
            onChange={(e) => set("funding_purpose", e.target.value)}
            maxLength={500}
            disabled={loading}
          />
          <p className="text-xs text-gray-500 font-body text-right">
            {form.funding_purpose.length}/500
          </p>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Funding Timeline">
            <select
              className={inputCls}
              value={form.urgency}
              onChange={(e) => set("urgency", e.target.value)}
              disabled={loading}
            >
              <option value="">Select timeline…</option>
              {URGENCY_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>

          <Field label="Credit Score Range">
            <select
              className={inputCls}
              value={form.credit_score_range}
              onChange={(e) => set("credit_score_range", e.target.value)}
              disabled={loading}
            >
              <option value="">Select range…</option>
              {CREDIT_SCORE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Current Monthly Revenue">
          <select
            className={inputCls}
            value={form.current_monthly_revenue}
            onChange={(e) => set("current_monthly_revenue", e.target.value)}
            disabled={loading}
          >
            <option value="">Select range…</option>
            {MONTHLY_REVENUE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </Field>

        <Field
          label="Do you have collateral to secure a loan?"
          hint="Real estate, equipment, inventory, or other assets"
        >
          <RadioGroup
            name="has_collateral"
            value={form.has_collateral}
            onChange={(v) => set("has_collateral", v)}
            disabled={loading}
          />
        </Field>

        <Field label="Do you have existing business debt?">
          <RadioGroup
            name="has_existing_debt"
            value={form.has_existing_debt}
            onChange={(v) => set("has_existing_debt", v)}
            disabled={loading}
          />
        </Field>

        <Field label="Primary obstacle to getting funded?">
          <select
            className={inputCls}
            value={form.primary_obstacle}
            onChange={(e) => set("primary_obstacle", e.target.value)}
            disabled={loading}
          >
            <option value="">Select obstacle…</option>
            {PRIMARY_OBSTACLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Have you applied for business funding before?">
          <RadioGroup
            name="previous_funding_attempts"
            value={form.previous_funding_attempts}
            onChange={(v) => set("previous_funding_attempts", v)}
            disabled={loading}
          />
        </Field>

        <div className="pt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/onboarding/step-1")}
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
