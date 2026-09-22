#!/usr/bin/env bash
# Runs the .github/workflows/ cron jobs locally via nektos/act, against a
# locally running `npm run dev` (localhost:3000) — no need to push/commit to
# see whether evaluate-alerts / refresh-screener actually work.
#
# Setup this script assumes (one-time):
#   brew install colima docker act
#   colima start
# `act` needs CRON_SECRET (same value as .env.local's) and
# CRADE_DEPLOYMENT_URL. Generate the local .secrets file once with:
#   node -e "const fs=require('fs');const v=fs.readFileSync('.env.local','utf8').split('\n').find(l=>l.startsWith('CRON_SECRET=')).slice('CRON_SECRET='.length);fs.writeFileSync('.secrets','CRON_SECRET='+v+'\nCRADE_DEPLOYMENT_URL=http://host.docker.internal:3000\n')"
#
# Why .act/*.yml instead of the real .github/workflows/*.yml: act 0.2.89 has
# a confirmed bug where a `run:` block containing 2+ separate
# `${{ secrets.X }}` references spread across multiple physical lines (e.g.
# one in a `-H` header, one in the URL, joined by a `\` line continuation —
# exactly how both real workflows are written for readability) evaluates to
# a garbled `%!t(string=...)` string instead of the real command. GitHub's
# actual runners handle the real files fine, so they're left untouched;
# .act/*.yml are local-only mirrors with the same logic, just flattened
# onto single lines to dodge the act bug.
#
# Also: act's job containers default to --network host, under which
# `host.docker.internal` does not resolve to the Mac host on Colima (it
# resolves to the Lima VM's own address instead) — hence --network bridge.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v act >/dev/null 2>&1; then
  echo "act not found — run: brew install colima docker act" >&2
  exit 1
fi
if ! command -v colima >/dev/null 2>&1; then
  echo "colima not found — run: brew install colima docker act" >&2
  exit 1
fi
if [ ! -f .secrets ]; then
  echo ".secrets not found — see this script's header comment to generate it" >&2
  exit 1
fi

if ! colima status >/dev/null 2>&1; then
  echo "Starting colima..."
  colima start
fi
export DOCKER_HOST="unix://${HOME}/.colima/docker.sock"

if ! curl -sf -o /dev/null http://localhost:3000 2>/dev/null; then
  echo "Warning: nothing responding on localhost:3000 — is 'npm run dev' running?" >&2
fi

WORKFLOW="${1:-}"
if [ -z "$WORKFLOW" ]; then
  echo "Usage: $0 <evaluate-alerts|refresh-screener>"
  exit 1
fi

exec act workflow_dispatch -W ".act/${WORKFLOW}.yml" --secret-file .secrets
