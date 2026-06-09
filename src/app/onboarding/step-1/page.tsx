"use client";

/**
 * Step 1 — Business Basics
 *
 * Collects: business_name, owner_name, email (pre-filled read-only), phone,
 * business_type, industry, naics_code, years_in_business, employees,
 * annual_revenue, state, county, city, zip.
 *
 * On save: POSTs to /api/onboarding/save-step → navigates to step-2.
 * Also creates/updates clients record via save-step route.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
];

const BUSINESS_TYPES = [
  "LLC", "Corporation", "Sole Proprietor", "Partnership", "Nonprofit", "Church", "Other",
];

const EMPLOYEE_RANGES = [
  { label: "Just me (1)", value: 1 },
  { label: "2–5", value: 3 },
  { label: "6–10", value: 8 },
  { label: "11–25", value: 18 },
  { label: "26–50", value: 38 },
  { label: "51–100", value: 75 },
  { label: "101–250", value: 175 },
  { label: "251–500", value: 375 },
  { label: "500+", value: 500 },
];

const REVENUE_RANGES = [
  { label: "Pre-revenue / $0", value: 0 },
  { label: "Under $50K", value: 25000 },
  { label: "$50K–$100K", value: 75000 },
  { label: "$100K–$250K", value: 175000 },
  { label: "$250K–$500K", value: 375000 },
  { label: "$500K–$1M", value: 750000 },
  { label: "$1M–$5M", value: 2500000 },
  { label: "$5M–$10M", value: 7500000 },
  { label: "$10M+", value: 10000000 },
];

interface FieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium font-body text-gray-200">
        {label}
        {required && <span className="text-[#C9A84C] ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 font-body">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white font-body placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none focus:ring-1 focus:ring-[#C9A84C] disabled:opacity-50";

export default function Step1Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    email: "",
    phone: "",
    business_type: "",
    industry: "",
    naics_code: "",
    years_in_business: "",
    employees: "",
    annual_revenue: "",
    state: "",
    county: "",
    city: "",
    zip: "",
  });

  // Pre-fill email from session
  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.email) {
        setForm((f) => ({ ...f, email: session.user.email! }));
      }
    });
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.business_name.trim()) {
      setError("Business name is required.");
      return;
    }
    if (!form.owner_name.trim()) {
      setError("Owner name is required.");
      return;
    }
    if (!form.business_type) {
      setError("Business type is required.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        step: 1,
        data: {
          business_name: form.business_name.trim(),
          owner_name: form.owner_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          business_type: form.business_type,
          industry: form.industry.trim() || undefined,
          naics_code: form.naics_code.trim() || undefined,
          years_in_business: form.years_in_business ? parseInt(form.years_in_business) : undefined,
          employees: form.employees ? parseInt(form.employees) : undefined,
          annual_revenue: form.annual_revenue ? parseInt(form.annual_revenue) : undefined,
          state: form.state || undefined,
          county: form.county.trim() || undefined,
          city: form.city.trim() || undefined,
          zip: form.zip.trim() || undefined,
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

      router.push("/onboarding/step-2");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 shadow-xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-2">
          Business Information
        </h2>
        <p className="text-sm text-gray-400 font-body">
          Tell us about your business so we can find the best funding opportunities for you.
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

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Business Name" required>
            <input
              type="text"
              className={inputCls}
              placeholder="Acme LLC"
              value={form.business_name}
              onChange={(e) => set("business_name", e.target.value)}
              maxLength={200}
              disabled={loading}
              required
            />
          </Field>

          <Field label="Owner / Primary Contact Name" required>
            <input
              type="text"
              className={inputCls}
              placeholder="Jane Smith"
              value={form.owner_name}
              onChange={(e) => set("owner_name", e.target.value)}
              maxLength={100}
              disabled={loading}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Email Address" required>
            <input
              type="email"
              className={inputCls + " opacity-60 cursor-not-allowed"}
              value={form.email}
              readOnly
              disabled
              aria-label="Email address (pre-filled from your account)"
            />
          </Field>

          <Field label="Phone Number">
            <input
              type="tel"
              className={inputCls}
              placeholder="+1 (555) 000-0000"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              maxLength={20}
              disabled={loading}
            />
          </Field>
        </div>

        <Field label="Business Type" required>
          <select
            className={inputCls}
            value={form.business_type}
            onChange={(e) => set("business_type", e.target.value)}
            disabled={loading}
            required
          >
            <option value="">Select business type…</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Industry">
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Retail, Construction, Healthcare"
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              maxLength={100}
              disabled={loading}
            />
          </Field>

          <Field label="NAICS Code">
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. 722511"
              value={form.naics_code}
              onChange={(e) => set("naics_code", e.target.value)}
              maxLength={10}
              disabled={loading}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="Years in Business">
            <input
              type="number"
              className={inputCls}
              placeholder="0"
              min={0}
              max={100}
              value={form.years_in_business}
              onChange={(e) => set("years_in_business", e.target.value)}
              disabled={loading}
            />
          </Field>

          <Field label="Number of Employees">
            <select
              className={inputCls}
              value={form.employees}
              onChange={(e) => set("employees", e.target.value)}
              disabled={loading}
            >
              <option value="">Select range…</option>
              {EMPLOYEE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Annual Revenue">
            <select
              className={inputCls}
              value={form.annual_revenue}
              onChange={(e) => set("annual_revenue", e.target.value)}
              disabled={loading}
            >
              <option value="">Select range…</option>
              {REVENUE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="State">
            <select
              className={inputCls}
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              disabled={loading}
            >
              <option value="">Select state…</option>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </Field>

          <Field label="County">
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Jefferson County"
              value={form.county}
              onChange={(e) => set("county", e.target.value)}
              maxLength={100}
              disabled={loading}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="City">
            <input
              type="text"
              className={inputCls}
              placeholder="Birmingham"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              maxLength={100}
              disabled={loading}
            />
          </Field>

          <Field label="ZIP Code">
            <input
              type="text"
              className={inputCls}
              placeholder="35203"
              value={form.zip}
              onChange={(e) => set("zip", e.target.value)}
              maxLength={5}
              pattern="\d{5}"
              disabled={loading}
            />
          </Field>
        </div>

        <div className="pt-4 flex justify-end">
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
