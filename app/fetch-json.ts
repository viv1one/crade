// Parses a fetch Response as JSON while degrading gracefully when the body
// isn't valid JSON at all — a platform timeout/error page, a proxy 502, an
// HTML crash page — cases raw `res.json()` turns into a cryptic
// "Unexpected token '...' is not valid JSON" instead of a message a user
// can act on. Also folds in the "check res.ok and surface data.error"
// pattern nearly every call site in this app repeats by hand.
// The message to show a user for a caught error. A rejected fetch() (offline,
// DNS, server unreachable) is a bare TypeError whose text is a browser-specific
// "Failed to fetch" / "Load failed"; that is replaced with something
// actionable. Errors thrown by safeJson already carry a readable message.
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) return "Couldn't reach the server — check your connection and try again.";
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function safeJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // An HTML body (proxy/platform error page) is noise to a user, so only
    // a short plain-text body is worth quoting.
    const looksLikeHtml = /^\s*</.test(text);
    const detail = looksLikeHtml ? "" : text.slice(0, 120) || res.statusText;
    throw new Error(
      res.ok
        ? "Server returned an unexpected response"
        : `Request failed (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}
