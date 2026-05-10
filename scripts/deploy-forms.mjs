#!/usr/bin/env node
/**
 * Deploy form definitions from the local SQLite database to a remote EmDash instance.
 *
 * Usage:
 *   PROD_URL=https://my-site.pages.dev EMDASH_TOKEN=<token> node scripts/deploy-forms.mjs
 *
 * Get an API token from the admin UI at <PROD_URL>/_emdash/admin → Settings → API Tokens,
 * or run `npx emdash login --url <PROD_URL>` first and set EMDASH_TOKEN to the stored token.
 *
 * Skips forms whose slug already exists in production (no overwrite).
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../data.db");

const PROD_URL = process.env.PROD_URL?.replace(/\/$/, "");
const TOKEN = process.env.EMDASH_TOKEN;

if (!PROD_URL) {
  console.error("Error: PROD_URL env var is required (e.g. https://my-site.pages.dev)");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

const rows = db
  .prepare(
    "SELECT id, data FROM _plugin_storage WHERE plugin_id = 'emdash-forms' AND collection = 'forms' ORDER BY created_at ASC",
  )
  .all();

db.close();

if (rows.length === 0) {
  console.log("No forms found in local database.");
  process.exit(0);
}

console.log(`Found ${rows.length} form(s) to deploy to ${PROD_URL}\n`);

const headers = {
  "Content-Type": "application/json",
  ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
};

let deployed = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const form = JSON.parse(row.data);

  process.stdout.write(`  "${form.name}" (${form.slug})... `);

  const res = await fetch(`${PROD_URL}/_emdash/api/plugins/emdash-forms/forms/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: form.name,
      slug: form.slug,
      pages: form.pages,
      settings: form.settings,
    }),
  });

  if (res.status === 409) {
    console.log("skipped (slug already exists in production)");
    skipped++;
    continue;
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? body.message ?? "";
    } catch {
      detail = await res.text();
    }
    console.log(`FAILED (${res.status}${detail ? `: ${detail}` : ""})`);
    failed++;
    continue;
  }

  const created = await res.json();
  console.log(`deployed → ${created.id}`);
  deployed++;
}

console.log(`\nDone. ${deployed} deployed, ${skipped} skipped, ${failed} failed.`);
if (failed > 0) process.exit(1);
