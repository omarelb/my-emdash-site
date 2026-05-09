import node from "@astrojs/node";
import react from "@astrojs/react";
import { atproto } from "@emdash-cms/auth-atproto";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

const isCloudflare = !!process.env.CF_PAGES;

// Cloudflare-specific modules are loaded dynamically so they don't get
// bundled (and fail to resolve `cloudflare:workers`) in local Node dev.
const { default: cloudflare, d1, r2, sandbox, webhookNotifierPlugin } =
  isCloudflare
    ? {
        ...(await import("@astrojs/cloudflare")),
        ...(await import("@emdash-cms/cloudflare")),
        ...(await import("@emdash-cms/plugin-webhook-notifier")),
      }
    : {};

export default defineConfig({
  output: "server",
  adapter: isCloudflare ? cloudflare() : node({ mode: "standalone" }),
  image: {
    layout: "constrained",
    responsiveStyles: true,
  },
  integrations: [
    react(),
    emdash({
      database: isCloudflare
        ? d1({ binding: "DB", session: "auto" })
        : sqlite({ url: "file:./data.db" }),
      storage: isCloudflare
        ? r2({ binding: "MEDIA" })
        : local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
      authProviders: [
        atproto({
          allowedHandles: ["omarelb.bsky.social"],
        }),
      ],
      plugins: [formsPlugin()],
      ...(isCloudflare && {
        sandboxed: [webhookNotifierPlugin()],
        sandboxRunner: sandbox(),
        marketplace: "https://marketplace.emdashcms.com",
      }),
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Playfair Display",
      cssVariable: "--font-serif",
      weights: [400, 500, 600, 700],
      fallbacks: ["serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Inter",
      cssVariable: "--font-inter",
      weights: [400, 800],
      fallbacks: ["sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Instrument Sans",
      cssVariable: "--font-instrument",
      weights: [400, 600],
      fallbacks: ["sans-serif"],
    },
  ],
  devToolbar: { enabled: false },
  vite: {
    ssr: {
      external: ["better-sqlite3", "kysely"],
      // emdash server modules use virtual:emdash/* imports that only resolve
      // at runtime via Astro's plugin system — exclude them from pre-bundling.
      noExternal: isCloudflare ? [/emdash/, /@emdash-cms/] : [],
    },
    environments: {
      client: {
        optimizeDeps: {
          noDiscovery: true,
          include: [
            "react",
            "react-dom",
            "react-dom/client",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
            "@astrojs/react/client.js",
            "emdash/ui",
            "emdash/runtime",
            "@emdash-cms/admin",
          ],
        },
      },
    },
    resolve: {
      dedupe: ["react", "react-dom"],
    },
  },
});
