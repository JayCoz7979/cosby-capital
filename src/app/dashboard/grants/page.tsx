import type { Metadata } from "next";

export const metadata: Metadata = { title: "Grant Matches" };

export default function GrantsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">
        Grant Matches
      </h1>
      <p className="text-sm text-gray-500 font-body">
        Loading grant matches…
      </p>
    </div>
  );
}
