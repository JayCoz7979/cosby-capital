/**
 * Auth layout — navy background, centered card, Cosby Capital branding.
 * No sidebar. Full-height centering. Used by all /auth/* pages.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Sign In | Cosby Capital",
    template: "%s | Cosby Capital",
  },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0A1628] flex flex-col">
      {/* Header with logo */}
      <header className="flex justify-center pt-10 pb-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold font-heading text-[#C9A84C] tracking-tight">
            Cosby Capital
          </h1>
          <p className="text-xs text-gray-400 font-body mt-1 tracking-widest uppercase">
            Your Capital. Your Future. Unlocked.
          </p>
        </div>
      </header>

      {/* Main content — vertically and horizontally centered */}
      <main className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-500 font-body">
          Powered by{" "}
          <a
            href="https://cosbyaisolutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#C9A84C] hover:underline"
          >
            Cosby AI Solutions
          </a>
        </p>
      </footer>
    </div>
  );
}
