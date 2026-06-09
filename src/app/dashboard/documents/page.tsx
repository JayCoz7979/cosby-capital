import type { Metadata } from "next";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">
        Documents
      </h1>
      <p className="text-sm text-gray-500 font-body">
        Loading documents…
      </p>
    </div>
  );
}
