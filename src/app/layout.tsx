import type { Metadata } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Cosby Capital — Your Capital. Your Future. Unlocked.",
    template: "%s | Cosby Capital",
  },
  description:
    "AI-powered capital solutions connecting businesses to grants, funding, lending, credit repair, and coaching.",
  metadataBase: new URL("https://cosbycapital.com"),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: "website",
    siteName: "Cosby Capital",
    title: "Cosby Capital — Your Capital. Your Future. Unlocked.",
    description:
      "AI-powered capital solutions connecting businesses to grants, funding, lending, credit repair, and coaching.",
    url: "https://cosbycapital.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col">
        <main className="flex-1">{children}</main>
        <footer className="bg-[#0A1628] text-white text-center py-4 text-sm">
          <p>
            Powered by{" "}
            <a
              href="https://cosbyaisolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C9A84C] hover:underline"
            >
              Cosby AI Solutions
            </a>{" "}
            | cosbyaisolutions.com
          </p>
        </footer>
      </body>
    </html>
  );
}
