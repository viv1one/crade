// Manually drives app/api/cron/refresh-screener/route.ts through every
// batch of the all-NSE universe against a local dev server — the scheduled
// GitHub Actions workflow (.github/workflows/refresh-screener.yml) can
// only ever reach a public deployed URL, never localhost, so without this
// the "All NSE stocks" Screener tab stays near-empty in local dev
// indefinitely. Run with the dev server already running:
//   npm run seed:screener-local
// Override the target with CRADE_BASE_URL if not on the default port.

import { readFileSync } from "node:fs";

function readEnvLocal(key) {
  try {
    const content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const line = content.split("\n").find((l) => l.trim().startsWith(`${key}=`));
    if (!line) return undefined;
    return line.slice(line.indexOf("=") + 1).trim().replace(/^"(.*)"$/, "$1");
  } catch {
    return undefined;
  }
}

const BASE_URL = process.env.CRADE_BASE_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? readEnvLocal("CRON_SECRET");
const BATCH_SIZE = 50;

async function main() {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not found in the environment or .env.local — set it first.");
    process.exitCode = 1;
    return;
  }

  let offset = 0;
  let totalFetched = 0;
  for (;;) {
    const res = await fetch(
      `${BASE_URL}/api/cron/refresh-screener?offset=${offset}&limit=${BATCH_SIZE}`,
      { headers: { Authorization: `Bearer ${CRON_SECRET}` } }
    );
    if (!res.ok) {
      console.error(`Batch at offset ${offset} failed: HTTP ${res.status}`);
      process.exitCode = 1;
      return;
    }
    const data = await res.json();
    totalFetched += data.fetched;
    console.log(
      `offset ${data.offset}: fetched ${data.fetched} (${totalFetched}/${data.totalUniverse} so far)`
    );
    if (data.done) break;
    offset += BATCH_SIZE;
  }

  console.log(`Done — ${totalFetched} symbols cached.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
