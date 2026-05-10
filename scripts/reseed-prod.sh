#!/usr/bin/env bash
#
# Reseed the production CMS by recreating the D1 database from scratch.
#
# DESTRUCTIVE: deletes all production CMS data (content, users, plugin storage,
# forms + submissions, etc.). R2 media is untouched. After redeploy, EmDash
# auto-runs migrations on the first request and re-applies seed/seed.json
# (because the new DB is empty).
#
# Usage: scripts/reseed-prod.sh [bookmark]
#   bookmark: jj bookmark to push after rotating database_id.
#             Defaults to the bookmark on @ (or @- if @ is empty).
#
set -euo pipefail

cd "$(dirname "$0")/.."

DB_NAME="my-emdash-site"
WRANGLER_CONFIG="wrangler.jsonc"

# ─── Resolve bookmark ─────────────────────────────────────────────
detect_bookmark() {
  local bm
  bm="$(jj log -r @ --no-graph -T 'bookmarks.join(",")' 2>/dev/null | tr ',' '\n' | head -1)"
  if [[ -z "$bm" ]]; then
    bm="$(jj log -r @- --no-graph -T 'bookmarks.join(",")' 2>/dev/null | tr ',' '\n' | head -1)"
  fi
  echo "$bm"
}

BOOKMARK="${1:-$(detect_bookmark)}"

if [[ -z "$BOOKMARK" ]]; then
  echo "Error: no bookmark found on @ or @-, and none was provided." >&2
  echo "Pass one as the first argument (e.g. portfolio_v2)." >&2
  exit 1
fi

# ─── Confirm ──────────────────────────────────────────────────────
cat <<EOF
================================================================
  PRODUCTION RESEED — DESTRUCTIVE
================================================================
  Database:    $DB_NAME (Cloudflare D1)
  Config:      $WRANGLER_CONFIG
  Bookmark:    $BOOKMARK

  Steps:
    1. DELETE the production D1 database (ALL DATA LOST)
    2. Create a new empty D1 database
    3. Write new database_id into $WRANGLER_CONFIG
    4. Create a new jj revision with the change
    5. Push '$BOOKMARK' via jj
    6. CF Pages redeploys; first request applies seed.json

  Not affected: R2 media, Wrangler secrets, OAuth config.
================================================================
EOF

read -r -p "Type the database name '$DB_NAME' to confirm: " CONFIRM
if [[ "$CONFIRM" != "$DB_NAME" ]]; then
  echo "Aborted."
  exit 1
fi

# ─── 1. Delete D1 ─────────────────────────────────────────────────
echo
echo "[1/5] Deleting D1 database '$DB_NAME'..."
pnpm wrangler d1 delete "$DB_NAME" --skip-confirmation

# ─── 2. Create D1 ─────────────────────────────────────────────────
echo
echo "[2/5] Creating new D1 database '$DB_NAME'..."
CREATE_OUTPUT="$(pnpm wrangler d1 create "$DB_NAME")"
echo "$CREATE_OUTPUT"

# Parse the new UUID. Wrangler prints something like:
#   database_id = "cc52acc8-d668-41a1-8eb7-7825b78cb4af"
# (or "database_id": "...") — so just grab the first UUID after "database_id".
NEW_ID="$(printf '%s\n' "$CREATE_OUTPUT" | \
  grep -E 'database_id' | \
  grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | \
  head -1)"

if [[ -z "$NEW_ID" ]]; then
  echo "Error: could not parse new database_id from wrangler output." >&2
  echo "Run 'pnpm wrangler d1 list' and update $WRANGLER_CONFIG manually." >&2
  exit 1
fi

echo
echo "New database_id: $NEW_ID"

# ─── 3. Create a fresh jj revision and update config ──────────────
echo
echo "[3/5] Creating new jj revision for the config change..."
jj new -m "chore: rotate D1 database_id after reseed"

echo "[3/5] Patching $WRANGLER_CONFIG..."
python3 - "$WRANGLER_CONFIG" "$NEW_ID" <<'PY'
import re, sys
path, new_id = sys.argv[1], sys.argv[2]
with open(path) as f:
    content = f.read()
patched, n = re.subn(
    r'("database_id"\s*:\s*)"[^"]+"',
    rf'\1"{new_id}"',
    content,
    count=1,
)
if n != 1:
    print(f"Error: expected exactly 1 database_id in {path}, found {n}", file=sys.stderr)
    sys.exit(1)
with open(path, "w") as f:
    f.write(patched)
PY

# Sanity-check the new id actually landed in the file
if ! grep -q "\"$NEW_ID\"" "$WRANGLER_CONFIG"; then
  echo "Error: new database_id $NEW_ID not found in $WRANGLER_CONFIG after patch." >&2
  exit 1
fi

# ─── 4. Move bookmark and push ────────────────────────────────────
echo
echo "[4/5] Moving bookmark '$BOOKMARK' to @ and pushing..."
jj bookmark set "$BOOKMARK" -r @ --allow-backwards

echo
echo "[5/5] Pushing to origin..."
jj git push --bookmark "$BOOKMARK"

# ─── Done ─────────────────────────────────────────────────────────
cat <<EOF

================================================================
  Done.
================================================================
  CF Pages should be redeploying '$BOOKMARK' now.
  Once live, the first request will:
    - run EmDash migrations on the empty D1
    - detect collectionCount === 0 and apply seed/seed.json
  Watch the deploy:  https://dash.cloudflare.com → Pages
EOF
