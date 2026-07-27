import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getCollections } from "../db/collections";

const COOKIE_NAME = "crade_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  email: string;
}

// Called after a successful signup/login. Only valid from Route Handlers /
// Server Actions — cookies() is read-only in Server Components.
export async function createSession(userId: ObjectId): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { sessions } = await getCollections();
  await sessions.insertOne({
    _id: new ObjectId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: new Date(),
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const { sessions } = await getCollections();
    await sessions.deleteOne({ tokenHash: hashToken(token) });
  }
  store.delete(COOKIE_NAME);
}

// Returns null rather than throwing when there's no valid session — callers
// that require a logged-in user should use requireUser() instead.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const { sessions, users } = await getCollections();
  const session = await sessions.findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt < new Date()) return null;

  const user = await users.findOne({ _id: session.userId });
  if (!user) return null;

  return { id: user._id.toString(), email: user.email };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

// For Route Handlers: throws UnauthorizedError (catch it and return a 401)
// rather than returning null, so call sites can't accidentally treat "not
// logged in" as a valid empty state.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
