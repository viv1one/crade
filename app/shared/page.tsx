"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShellNav } from "../app-shell-nav";

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
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />
      <main className="w-full max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Shared with me</h1>
        <ul className="card flex flex-col divide-y divide-border overflow-hidden">
          {rows === null && (
            <li className="p-4 text-sm text-foreground-muted">Loading…</li>
          )}
          {rows?.length === 0 && (
            <li className="p-4 text-sm text-foreground-muted">
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
      </main>
    </div>
  );
}
