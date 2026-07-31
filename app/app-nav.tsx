"use client";

import Link from "next/link";
import { AccountNav } from "./account-nav";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/alerts", label: "Alerts" },
  { href: "/screener", label: "Screener" },
  { href: "/shared", label: "Shared with me" },
  { href: "/backtest", label: "Backtest a strategy →" },
  { href: "/help", label: "Help" },
];

export function AppNav() {
  return (
    <nav className="w-full max-w-4xl flex flex-wrap justify-between items-center gap-4">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-semibold text-accent">
          Crade
        </Link>
        <AccountNav />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium underline underline-offset-4 hover:no-underline"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
