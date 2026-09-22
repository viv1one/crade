"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountNav } from "./account-nav";

// The mobile bottom bar rendered below is `fixed`, so it overlays whatever
// sits at the bottom of the page regardless of where THIS component is
// called from in a page's own JSX (typically near the top, before <main>)
// — clearance for it can't live inside this component's own output. Every
// page wrapper that renders <AppShellNav /> adds `pb-20` (mobile only,
// cleared again at `sm:`) to its own root div for exactly this reason.

interface SubLink {
  href: string;
  label: string;
}

interface NavGroup {
  key: string;
  icon: string;
  label: string;
  href?: string; // direct destination — Watchlist, Vault
  links?: SubLink[]; // grouped destinations — Discovery, AI Desk, Menu
}

// 5-group structure per the spec's PWA nav (Watchlist / Discovery / AI Desk
// / Vault / Menu) — but every existing route is kept exactly as-is (no IA
// rewrite risking broken links elsewhere in the app): Discovery/AI Desk/
// Menu are just a picker over routes that already existed under the old
// flat AppNav. "AI Desk"'s Chat destination is `/#chat` (the home page's
// chat section, not a separate route) — Chat has always lived on the home
// page; giving it its own route would be a real route change, out of scope
// here.
const NAV_GROUPS: NavGroup[] = [
  { key: "watchlist", icon: "📈", label: "Watchlist", href: "/" },
  {
    key: "discovery",
    icon: "🔍",
    label: "Discovery",
    links: [
      { href: "/screener", label: "Screener" },
      { href: "/backtest", label: "Backtest a strategy" },
    ],
  },
  {
    key: "ai-desk",
    icon: "🤖",
    label: "AI Desk",
    links: [
      { href: "/#chat", label: "Chat" },
      { href: "/trading-agents", label: "Trading Agents" },
    ],
  },
  { key: "vault", icon: "🏦", label: "Vault", href: "/holdings" },
  {
    key: "menu",
    icon: "☰",
    label: "Menu",
    links: [
      { href: "/journal", label: "Journal" },
      { href: "/alerts", label: "Alerts" },
      { href: "/shared", label: "Shared with me" },
      { href: "/help", label: "Help" },
    ],
  },
];

function isGroupActive(group: NavGroup, pathname: string): boolean {
  if (group.href) return group.href === "/" ? pathname === "/" : pathname.startsWith(group.href);
  return (group.links ?? []).some((l) => pathname.startsWith(l.href.split("#")[0]) && l.href.split("#")[0] !== "/");
}

export function AppShellNav() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string | null>(null);

  function toggle(key: string) {
    setExpanded((prev) => (prev === key ? null : key));
  }

  const expandedGroup = NAV_GROUPS.find((g) => g.key === expanded);

  return (
    <>
      {/* Mobile: slim brand strip (bottom bar below has no room for it) */}
      <div className="sm:hidden w-full max-w-4xl card flex items-center justify-between px-4 py-2">
        <Link href="/" className="text-lg font-semibold text-accent">
          Crade
        </Link>
        <AccountNav />
      </div>

      {/* Desktop / tablet: single horizontal bar, same footprint as the
          previous flat AppNav. */}
      <nav className="hidden sm:flex card w-full max-w-4xl flex-col gap-2 px-5 py-3">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-semibold text-accent">
              Crade
            </Link>
            <AccountNav />
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {NAV_GROUPS.map((group) =>
              group.href ? (
                <Link
                  key={group.key}
                  href={group.href}
                  className={`text-sm font-medium transition-colors ${
                    isGroupActive(group, pathname) ? "text-foreground" : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {group.icon} {group.label}
                </Link>
              ) : (
                <button
                  key={group.key}
                  onClick={() => toggle(group.key)}
                  aria-expanded={expanded === group.key}
                  className={`text-sm font-medium transition-colors ${
                    isGroupActive(group, pathname) ? "text-foreground" : "text-foreground-muted hover:text-foreground"
                  }`}
                >
                  {group.icon} {group.label} {expanded === group.key ? "▲" : "▾"}
                </button>
              )
            )}
          </div>
        </div>
        {expandedGroup?.links && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
            {expandedGroup.links.map((l) => (
              <Link key={l.href} href={l.href} className="btn-secondary-sm" onClick={() => setExpanded(null)}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Mobile: fixed bottom tab bar, with a sub-pill row that pops up
          above it when a grouped tab is tapped. */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 flex flex-col">
        {expandedGroup?.links && (
          <div className="card rounded-b-none border-b-0 flex flex-wrap gap-2 px-3 py-2">
            {expandedGroup.links.map((l) => (
              <Link key={l.href} href={l.href} className="btn-secondary-sm" onClick={() => setExpanded(null)}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
        <div className="card rounded-none border-x-0 border-b-0 grid grid-cols-5">
          {NAV_GROUPS.map((group) =>
            group.href ? (
              <Link
                key={group.key}
                href={group.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium ${
                  isGroupActive(group, pathname) ? "text-accent" : "text-foreground-muted"
                }`}
              >
                <span aria-hidden="true">{group.icon}</span>
                {group.label}
              </Link>
            ) : (
              <button
                key={group.key}
                onClick={() => toggle(group.key)}
                aria-expanded={expanded === group.key}
                className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium ${
                  isGroupActive(group, pathname) || expanded === group.key ? "text-accent" : "text-foreground-muted"
                }`}
              >
                <span aria-hidden="true">{group.icon}</span>
                {group.label}
              </button>
            )
          )}
        </div>
      </div>
    </>
  );
}
