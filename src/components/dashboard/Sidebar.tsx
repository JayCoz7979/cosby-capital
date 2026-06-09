"use client";

/**
 * Sidebar — client component (needs usePathname for active state).
 *
 * Forest green background (#2D5016), gold active indicator (#C9A84C).
 * Also exports SidebarDrawer for mobile overlay.
 */

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Building2,
  TrendingUp,
  CheckCircle,
  FileText,
  Bell,
  X,
  Menu,
  type LucideIcon,
} from "lucide-react";

interface NavLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/dashboard/grants", label: "Grant Matches", Icon: Search },
  { href: "/dashboard/lenders", label: "Lender Matches", Icon: Building2 },
  { href: "/dashboard/credit", label: "Credit Roadmap", Icon: TrendingUp },
  { href: "/dashboard/approvals", label: "Approvals", Icon: CheckCircle },
  { href: "/dashboard/documents", label: "Documents", Icon: FileText },
  {
    href: "/dashboard/notifications",
    label: "Notifications",
    Icon: Bell,
  },
];

function tierLabel(tier: string): string {
  switch (tier) {
    case "starter":
      return "Starter";
    case "growth":
      return "Growth";
    case "capital_partner":
      return "Capital Partner";
    case "done_for_you":
      return "Done For You";
    default:
      return tier;
  }
}

interface SidebarProps {
  tier: string;
}

function SidebarNav({ tier, onLinkClick }: SidebarProps & { onLinkClick?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <span className="text-[#C9A84C] font-heading text-lg font-semibold tracking-tight">
          Cosby Capital
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4" aria-label="Dashboard navigation">
        <ul className="space-y-0.5" role="list">
          {NAV_LINKS.map(({ href, label, Icon }) => {
            const isActive = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onLinkClick}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "min-h-[44px] flex items-center gap-3 px-4 py-2 text-sm font-body",
                    "focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:ring-offset-[#2D5016]",
                    "transition-colors duration-150",
                    isActive
                      ? "border-l-4 border-[#C9A84C] text-[#C9A84C] bg-white/10"
                      : "text-white/80 hover:text-white hover:bg-white/5 pl-4",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tier badge */}
      <div className="px-4 py-4 border-t border-white/10">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-body font-medium bg-[#C9A84C]/20 text-[#C9A84C]">
          {tierLabel(tier)}
        </span>
      </div>
    </div>
  );
}

export function Sidebar({ tier }: SidebarProps) {
  return <SidebarNav tier={tier} />;
}

// ── Mobile drawer ─────────────────────────────────────────────────────────────

interface SidebarDrawerProps {
  tier: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SidebarDrawer({ tier, isOpen, onClose }: SidebarDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 md:hidden"
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className="fixed left-0 top-0 bottom-0 z-50 w-[240px] bg-forest flex flex-col md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute top-4 right-4 text-white/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <SidebarNav tier={tier} onLinkClick={onClose} />
      </div>
    </>
  );
}

// ── Mobile menu trigger (used in TopNav) ─────────────────────────────────────

interface MobileMenuButtonProps {
  onClick: () => void;
}

export function MobileMenuButton({ onClick }: MobileMenuButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Open navigation menu"
      className="md:hidden text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:ring-offset-[#2D5016] p-1 rounded"
    >
      <Menu className="h-5 w-5" aria-hidden />
    </button>
  );
}
