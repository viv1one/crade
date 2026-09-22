import { NextResponse, type NextRequest } from "next/server";

// Cookie-presence check only — fast, no DB round trip. This is a UX
// redirect, not the authoritative check: every Route Handler that touches
// per-user data still calls requireUser() (lib/auth/session.ts), which
// validates the session against Mongo and is what actually enforces access
// control. Renamed from middleware.ts/`middleware` per Next.js 16 (proxy's
// runtime is fixed to nodejs, not edge, but nothing here was edge-specific).
const COOKIE_NAME = "crade_session";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|login|signup).*)",
  ],
};
