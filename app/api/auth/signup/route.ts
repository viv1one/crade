import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/collections";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!rateLimit(`signup:${clientKey(request)}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again in a few minutes" }, { status: 429 });
  }

  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const consented = body.consented === true;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  // The signup form's checkbox is required client-side, but that alone
  // doesn't stop a direct API call from skipping it — check server-side
  // too, so consentedAt always reflects a real acknowledgment.
  if (!consented) {
    return NextResponse.json(
      { error: "You must acknowledge Crade is a simulation-only research tool to continue" },
      { status: 400 }
    );
  }

  const { users } = await getCollections();
  const existing = await users.findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const _id = new ObjectId();
  await users.insertOne({ _id, email, passwordHash, createdAt: new Date(), consentedAt: new Date() });
  await createSession(_id);

  return NextResponse.json({ email });
}
