import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/collections";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!rateLimit(`login:${clientKey(request)}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes" }, { status: 429 });
  }

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const { users } = await getCollections();
  const user = await users.findOne({ email });

  // Same error for "no such user" and "wrong password" — don't leak which
  // one it was.
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession(user._id);
  return NextResponse.json({ email: user.email });
}
