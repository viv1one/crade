"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SharedWithMeRow {
  _id: string;
  ownerId: string;
  ownerEmail: string;
  resourceType: string;
}

export default function SharedWithMePage() {
  const [rows, setRows] = useState<SharedWithMeRow[] | null>(null);

  useEffect(() => {
    fetch("/api/shares/shared-with-me")
      .then((res) => res.json())
      .then((data) => setRows(Array.isArray(data) ? data : []));
  }, []);

  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <nav className="w-full max-w-2xl flex justify-start">
        <Link href="/" className="text-sm font-medium underline underline-offset-4 hover:no-underline">
          ← Watchlist &amp; portfolio
        </Link>
      </nav>
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Shared with me</h1>
        <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145] rounded-lg border border-black/[.08] dark:border-white/[.145]">
          {rows === null && (
            <li className="p-4 text-sm text-black/50 dark:text-white/50">Loading…</li>
          )}
          {rows?.length === 0 && (
            <li className="p-4 text-sm text-black/50 dark:text-white/50">
              Nobody has shared anything with you yet.
            </li>
          )}
          {rows?.map((row) => (
            <li key={row._id} className="flex items-center justify-between p-4">
              <span className="text-sm">
                {row.ownerEmail}&apos;s {row.resourceType}
              </span>
              {row.resourceType === "watchlist" && (
                <Link
                  href={`/shared/${row.ownerId}/watchlist`}
                  className="text-xs underline underline-offset-4 hover:no-underline"
                >
                  View →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
