#!/usr/bin/env bash
set -euo pipefail

# Usage: smoke-test.sh <WEB_URL> <API_URL>
# Verifies that both the frontend and backend are reachable and responding after a deploy.
# Exits 1 if either check fails.

WEB_URL="${1:?Usage: smoke-test.sh <WEB_URL> <API_URL>}"
API_URL="${2:?Usage: smoke-test.sh <WEB_URL> <API_URL>}"

TIMEOUT=60  # seconds — generous to accommodate App Service cold starts on B1 SKU
FAILED=0

echo "Running smoke tests..."
echo "  Web: $WEB_URL"
echo "  API: $API_URL"
echo ""

# ── API check ─────────────────────────────────────────────────────────────────
# GET /api/environments must return a non-5xx response (401 is acceptable — API is protected)
echo "Checking API: GET $API_URL/api/environments"

HTTP_CODE=$(curl --silent --show-error --location \
  --max-time "$TIMEOUT" \
  --output /dev/null \
  --write-out "%{http_code}" \
  "$API_URL/api/environments" 2>&1) || {
  echo "  FAIL: API request failed (curl exit code $?)"
  FAILED=1
}

if [ "$FAILED" -eq 0 ]; then
  if [[ "$HTTP_CODE" -ge 500 ]] || [ "$HTTP_CODE" = "000" ]; then
    echo "  FAIL: Expected non-5xx response, got $HTTP_CODE"
    FAILED=1
  else
    echo "  OK (HTTP $HTTP_CODE)"
  fi
fi

# ── Web check ─────────────────────────────────────────────────────────────────
# GET / must return HTTP 200 (follows redirects — login page is acceptable)
echo "Checking Web: GET $WEB_URL"

curl --silent --show-error --fail --location \
  --max-time "$TIMEOUT" \
  --output /dev/null \
  --write-out "  OK (HTTP %{http_code})\n" \
  "$WEB_URL" || {
  echo "  FAIL: Web request failed (curl exit code $?)"
  FAILED=1
}

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILED" -eq 1 ]; then
  echo "Smoke test FAILED. Check App Service logs in Azure Portal."
  exit 1
else
  echo "Smoke test passed."
  exit 0
fi
