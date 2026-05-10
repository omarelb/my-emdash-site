# Configuration

## astro.config.mjs

### Node.js (local development / self-hosted)

```javascript
import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
	output: "server",
	adapter: node({ mode: "standalone" }),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
		}),
	],
	devToolbar: { enabled: false },
});
```

### Cloudflare (D1 + R2)

```javascript
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
		}),
	],
	devToolbar: { enabled: false },
});
```

Requires a `wrangler.jsonc` with D1 and R2 bindings:

```jsonc
{
	"name": "my-site",
	"compatibility_date": "2026-02-24",
	"compatibility_flags": ["nodejs_compat"],
	"assets": { "directory": "./dist" },
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "my-site",
			"database_id": "", // from `wrangler d1 create my-site`
		},
	],
	"r2_buckets": [
		{
			"binding": "MEDIA",
			"bucket_name": "my-site-media",
		},
	],
}
```

### Plugins

Register plugins in `astro.config.mjs`:

```javascript
import { auditLogPlugin } from "@emdash-cms/plugin-audit-log";

emdash({
	database: sqlite({ url: "file:./data.db" }),
	storage: local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
	plugins: [auditLogPlugin()],
}),
```

## live.config.ts

Every EmDash site needs this file at `src/live.config.ts`. It's boilerplate -- the same in every project:

```typescript
import { defineLiveCollection } from "astro:content";
import { emdashLoader } from "emdash/runtime";

export const collections = {
	_emdash: defineLiveCollection({ loader: emdashLoader() }),
};
```

This registers EmDash's live content collections with Astro. All content types are served through the single `_emdash` collection -- you query specific types using `getEmDashCollection("posts")` etc.

## emdash-env.d.ts

Auto-generated at the project root when the dev server starts. Provides TypeScript types for your collections. This is the file your `tsconfig.json` includes.

```typescript
/// <reference types="emdash/locals" />

import type { PortableTextBlock } from "emdash";

export interface Post {
	id: string;
	slug: string | null;
	status: string;
	title: string;
	featured_image?: {
		id: string;
		src?: string;
		alt?: string;
		width?: number;
		height?: number;
	};
	content?: PortableTextBlock[];
	excerpt?: string;
	createdAt: Date;
	updatedAt: Date;
	publishedAt: Date | null;
}

declare module "emdash" {
	interface EmDashCollections {
		posts: Post;
	}
}
```

The dev server regenerates this file automatically when schema changes. You can also generate it manually:

## Type Generation

```bash
# From local dev server (writes emdash-env.d.ts at project root)
npx emdash types

# From remote instance
npx emdash types --url https://my-site.pages.dev

# Custom output path
npx emdash types --output src/types/cms.ts
```

The CLI also writes `.emdash/schema.json` with the raw schema for tooling.

## package.json

Key dependencies for a Node.js site:

```json
{
	"dependencies": {
		"astro": "^6.0.0",
		"emdash": "workspace:*",
		"@astrojs/node": "^9.0.0",
		"@astrojs/react": "^4.0.0",
		"react": "^18.0.0",
		"react-dom": "^18.0.0"
	}
}
```

For Cloudflare, replace `@astrojs/node` with `@astrojs/cloudflare` and add `@emdash-cms/cloudflare`.

## Dev Server

```bash
npx emdash dev              # Start dev server (runs migrations, applies seed)
npx emdash dev --types      # Start and generate types from schema
```

The admin UI is at `http://localhost:4321/_emdash/admin`. On first run, you'll go through setup to create an admin account.

## Cloudflare D1 — Local Dev Seeding

**Critical:** `npx emdash seed` (and `pnpm seed`) always targets `./data.db` (SQLite), but the Cloudflare adapter dev server uses **Miniflare's emulated D1** — a different file at `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite`. Seeding `data.db` has no effect on what the dev server serves.

### Correct workflow

**Step 1 — Start the dev server first** (so Miniflare creates the D1/R2 directories):

```bash
npx emdash dev
```

**Step 2 — Find the Miniflare D1 SQLite file:**

```bash
ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata
# e.g. → .wrangler/state/v3/d1/miniflare-D1DatabaseObject/eeb95ee5...sqlite
```

**Step 3 — Seed into the Miniflare D1 file directly:**

```bash
npx emdash seed seed/seed.json \
  --database .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
```

This uploads media files to `./uploads/` (local) and records them in the D1 database with R2 `storage_key` values.

**Step 4 — Copy media blobs into Miniflare R2:**

The seed writes files to `./uploads/<id>.jpg`. Miniflare R2 expects them in two places:
- **Metadata DB** (object key → blob_id mapping): `.wrangler/state/v3/r2/miniflare-R2BucketObject/<hash>.sqlite` — already written by Step 3
- **Blob files**: `.wrangler/state/v3/r2/my-emdash-media/blobs/` — must be copied manually

```bash
R2DB=".wrangler/state/v3/r2/miniflare-R2BucketObject/<hash>.sqlite"
BLOBS_DIR=".wrangler/state/v3/r2/my-emdash-media/blobs"
mkdir -p "$BLOBS_DIR"

# For each newly-seeded file in uploads/:
for f in uploads/<prefix>*.jpg; do
  KEY=$(basename "$f")
  SIZE=$(wc -c < "$f" | tr -d ' ')
  HASH=$(shasum -a 256 "$f" | cut -d' ' -f1)
  TIMESTAMP=$(python3 -c "import time; print(hex(int(time.time()*1000))[2:])")
  BLOB_ID="${HASH}${TIMESTAMP}"
  ETAG=$(md5 -q "$f")
  cp "$f" "$BLOBS_DIR/$BLOB_ID"
  sqlite3 "$R2DB" "INSERT OR REPLACE INTO _mf_objects \
    (key, blob_id, version, size, etag, uploaded, checksums, http_metadata, custom_metadata) \
    VALUES ('$KEY','$BLOB_ID','v1',$SIZE,'$ETAG',$(date +%s)000,'{}','{\"contentType\":\"image/jpeg\"}','{}');"
done
```

### Why `pnpm seed` won't work as-is

The `pnpm seed` / `emdash seed` command has no Cloudflare/Wrangler awareness. It always uses SQLite directly. The `--database` flag is the only way to target a different file. There is currently no `--d1-local` flag or automatic Miniflare targeting.

### Re-seeding from scratch

To fully wipe and re-seed the local dev environment:

```bash
# 1. Delete Miniflare's state
rm -rf .wrangler/state/v3/d1/miniflare-D1DatabaseObject/

# 2. Start dev server (recreates empty D1)
npx emdash dev &
sleep 12

# 3. Seed (Steps 2-4 above)
```
