"use client";

import Link from "next/link";
import { AccountNav } from "./account-nav";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/holdings", label: "My Holdings" },
  { href: "/alerts", label: "Alerts" },
  { href: "/screener", label: "Screener" },
  { href: "/shared", label: "Shared with me" },
  { href: "/backtest", label: "Backtest a strategy →" },
  { href: "/help", label: "Help" },
];

export function AppNav() {
  return (
    <nav className="card w-full max-w-4xl flex flex-wrap justify-between items-center gap-4 px-5 py-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-semibold text-accent">
          Crade
        </Link>
        <AccountNav />
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
