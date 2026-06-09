"use client";

/**
 * Step 3 — Business Flags
 *
 * Checkboxes for minority/woman/veteran/rural/nonprofit/church ownership.
 * NONPROFIT BRANCH: if is_nonprofit=true OR is_church=true, show additional fields.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

const ORG_TYPES = ["501(c)(3)", "501(c)(6)", "Church", "Other"] as const;

const FUNDING_NEEDS = [
  "Program expansion",
  "Facilities",
  "Equipment",
  "Capacity building",
  "Other",
] as const;

const BUDGET_RANGES = [
  { label: "Under $100K", value: "under_100k" },
  { label: "$100K–$500K", value: "100k_500k" },
  { label: "$500K–$1M", value: "500k_1m" },
  { label: "$1M–$5M", value: "1m_5m" },
  { label: "$5M+", value: "5m_plus" },
];

const inputCls =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white font-body placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] disabled:opacity-50";

interface CheckboxCardProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function CheckboxCard({
  label,
  description,
  checked,
  onChange,
  disabled,
}: CheckboxCardProps) {
  return (
    <label
      className={[
        "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors select-none",
        checked
          ? "border-[#C9A84C] bg-[#C9A84C]/10"
          : "border-white/15 bg-white/5 hover:border-white/30",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-gray-400 text-[#C9A84C] accent-[#C9A84C] flex-shrink-0"
      />
      <div>
        <p className="text-sm font-medium font-body text-white">{label}</p>
        <p className="text-xs text-gray-400 font-body mt-0.5">{description}</p>
      </div>
    </label>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, hint, required, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium font-body text-gray-200">
        {label}
        {required && <span className="text-[#C9A84C] ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 font-body">{hint}</p>}
      {children}
    </div>
  );
}

export default function Step3Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flags, setFlags] = useState({
    is_minority_owned: false,
    is_woman_owned: false,
    is_veteran_owned: false,
    is_rural: false,
    is_nonprofit: false,
    is_church: false,
  });

  const [nonprofitData, setNonprofitData] = useState({
    org_type: "" as "" | typeof ORG_TYPES[number],
    nonprofit_ein: "",
    mission_statement: "",
    annual_operating_budget: "",
    primary_funding_need: "" as "" | typeof FUNDING_NEEDS[number],
  });

  const showNonprofitBranch = flags.is_nonprofit || flags.is_church;

  function setFlag(field: keyof typeof flags, value: boolean) {
    setFlags((f) => ({ ...f, [field]: value }));
  }

  function setNpo<K extends keyof typeof nonprofitData>(
    field: K,
    value: (typeof nonprofitData)[K]
  ) {
    setNonprofitData((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data: Record<string, unknown> = { ...flags };

      if (showNonprofitBranch) {
        if (nonprofitData.org_type) data.org_type = nonprofitData.org_type;
        if (nonprofitData.nonprofit_ein.trim())
          data.nonprofit_ein = nonprofitData.nonprofit_ein.trim();
        if (nonprofitData.mission_statement.trim())
          data.mission_statement = nonprofitData.mission_statement.trim();
        if (nonprofitData.annual_operating_budget)
          data.annual_operating_budget = nonprofitData.annual_operating_budget;
        if (nonprofitData.primary_funding_need)
          data.primary_funding_need = nonprofitData.primary_funding_need;
      }

      const res = await fetch("/api/onboarding/save-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: 3, data }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setError(body.error ?? "Failed to save. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/onboarding/step-4");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-2">
          Business Profile Flags
        </h2>
        <p className="text-sm text-gray-400 font-body">
          These designations unlock additional funding programs and grants.
          Check all that apply.
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
        {/* Flag checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CheckboxCard
            label="Minority-Owned Business"
            description="51%+ owned by minority individuals"
            checked={flags.is_minority_owned}
            onChange={(v) => setFlag("is_minority_owned", v)}
            disabled={loading}
          />
          <CheckboxCard
            label="Woman-Owned Business"
            description="51%+ owned by women"
            checked={flags.is_woman_owned}
            onChange={(v) => setFlag("is_woman_owned", v)}
            disabled={loading}
          />
          <CheckboxCard
            label="Veteran-Owned Business"
            description="51%+ owned by veterans"
            checked={flags.is_veteran_owned}
            onChange={(v) => setFlag("is_veteran_owned", v)}
            disabled={loading}
          />
          <CheckboxCard
            label="Rural Business"
            description="Located in rural area per USDA definition"
            checked={flags.is_rural}
            onChange={(v) => setFlag("is_rural", v)}
            disabled={loading}
          />
          <CheckboxCard
            label="Nonprofit Organization"
            description="Tax-exempt nonprofit entity"
            checked={flags.is_nonprofit}
            onChange={(v) => setFlag("is_nonprofit", v)}
            disabled={loading}
          />
          <CheckboxCard
            label="Church or Faith-Based Organization"
            description="Church, mosque, synagogue, or faith-based ministry"
            checked={flags.is_church}
            onChange={(v) => setFlag("is_church", v)}
            disabled={loading}
          />
        </div>

        {/* Nonprofit/church branch — shown when is_nonprofit or is_church */}
        {showNonprofitBranch && (
          <div className="mt-6 p-6 rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 bg-[#C9A84C]/20" />
              <span className="text-xs font-body text-[#C9A84C] font-medium uppercase tracking-widest">
                Nonprofit / Faith-Based Details
              </span>
              <div className="h-px flex-1 bg-[#C9A84C]/20" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Organization Type">
                <select
                  className={inputCls}
                  value={nonprofitData.org_type}
                  onChange={(e) =>
                    setNpo("org_type", e.target.value as typeof nonprofitData.org_type)
                  }
                  disabled={loading}
                >
                  <option value="">Select type…</option>
                  {ORG_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="EIN / Tax ID">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="XX-XXXXXXX"
                  value={nonprofitData.nonprofit_ein}
                  onChange={(e) => setNpo("nonprofit_ein", e.target.value)}
                  maxLength={10}
                  disabled={loading}
                />
              </Field>
            </div>

            <Field label="Mission Statement" hint="Max 300 characters">
              <textarea
                className={inputCls + " resize-none h-20"}
                placeholder="Describe your organization's mission…"
                value={nonprofitData.mission_statement}
                onChange={(e) => setNpo("mission_statement", e.target.value)}
                maxLength={300}
                disabled={loading}
              />
              <p className="text-xs text-gray-500 font-body text-right">
                {nonprofitData.mission_statement.length}/300
              </p>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Annual Operating Budget">
                <select
                  className={inputCls}
                  value={nonprofitData.annual_operating_budget}
                  onChange={(e) =>
                    setNpo("annual_operating_budget", e.target.value)
                  }
                  disabled={loading}
                >
                  <option value="">Select range…</option>
                  {BUDGET_RANGES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Primary Funding Need">
                <select
                  className={inputCls}
                  value={nonprofitData.primary_funding_need}
                  onChange={(e) =>
                    setNpo(
                      "primary_funding_need",
                      e.target.value as typeof nonprofitData.primary_funding_need
                    )
                  }
                  disabled={loading}
                >
                  <option value="">Select need…</option>
                  {FUNDING_NEEDS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/onboarding/step-2")}
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
