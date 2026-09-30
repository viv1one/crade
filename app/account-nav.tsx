"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AccountNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { user: { email: string } | null }) => setEmail(data.user?.email ?? null))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-w-0 items-center gap-3 text-sm text-foreground-muted min-h-5">
      {email && (
        <>
          <span className="truncate">{email}</span>
          <button onClick={handleLogout} className="shrink-0 whitespace-nowrap underline underline-offset-4 hover:no-underline touch-target">
            Log out
          </button>
        </>
      )}
    </div>
  );
}
