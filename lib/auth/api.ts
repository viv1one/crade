import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError, type SessionUser } from "./session";

// Route-handler helper: returns the user, or a ready-to-return 401
// NextResponse. Callers do:
//   const user = await requireUserOrResponse();
//   if (user instanceof NextResponse) return user;
export async function requireUserOrResponse(): Promise<SessionUser | NextResponse> {
  try {
    return await requireUser();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    throw err;
  }
}
