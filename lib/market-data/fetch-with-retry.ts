// Retries only on 429 (rate limited) or a network-level failure — anything
// else (404, malformed response, etc.) is a real error, not a transient
// one, and retrying it just wastes time. Kept to a small retry count with
// short backoff: this is for smoothing over a brief burst-limit, not for
// working around a sustained block (retrying hard into a sustained block
// just makes it worse).
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 300;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429) return res;
      lastError = new Error(`429 from ${url}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
