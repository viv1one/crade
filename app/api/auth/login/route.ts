import { NextResponse } from "next/server";
import { getCollections } from "@/lib/db/collections";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
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
