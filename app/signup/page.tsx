"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, consented }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sign up failed");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background">
      <div className="card w-full max-w-sm flex flex-col gap-6 p-8">
        <div className="flex flex-col items-center gap-1">
          <span className="text-lg font-semibold text-accent">Crade</span>
          <h1 className="text-xl font-semibold">Create your account</h1>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 characters)"
              className="input"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-foreground-muted">
            <input
              type="checkbox"
              required
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5"
            />
            I understand Crade is a simulation-only research tool, not investment advice, and not
            connected to any broker.
          </label>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-40">
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="text-sm text-foreground-muted text-center">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:no-underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
