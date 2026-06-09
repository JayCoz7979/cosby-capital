import type { Metadata } from "next";

export const metadata: Metadata = { title: "Credit Roadmap" };

export default function CreditPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">
        Credit Roadmap
      </h1>
      <p className="text-sm text-gray-500 font-body">
        Loading credit roadmap…
      </p>
    </div>
  );
}
