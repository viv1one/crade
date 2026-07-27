import { randomUUID } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "crade_device_id";

// Anonymous per-browser identity, not real auth. Stands in for a userId
// until an actual auth system exists — see CLAUDE.md. Only callable from
// Route Handlers / Server Actions, where `cookies()` is writable.
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return id;
}
