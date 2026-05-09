import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { atproto } from "@emdash-cms/auth-atproto";
import { d1, r2, sandbox } from "@emdash-cms/cloudflare";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { webhookNotifierPlugin } from "@emdash-cms/plugin-webhook-notifier";
import { defineConfig, fontProviders } from "astro/config";
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
      authProviders: [
        atproto({
          allowedHandles: ["omarelb.bsky.social"],
        }),
      ],
      plugins: [formsPlugin()],
      sandboxed: [webhookNotifierPlugin()],
      sandboxRunner: sandbox(),
      marketplace: "https://marketplace.emdashcms.com",
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
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react-dom/client",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "@astrojs/react/client.js",
          "emdash/ui",
          "emdash/runtime",
          "emdash/middleware",
          "emdash/middleware/redirect",
          "emdash/middleware/setup",
          "emdash/middleware/auth",
          "emdash/middleware/request-context",
          "emdash/media/local-runtime",
          "@emdash-cms/admin",
          "@emdash-cms/plugin-forms",
          "@emdash-cms/plugin-forms/astro",
          "@emdash-cms/cloudflare/db/d1",
          "@emdash-cms/cloudflare/storage/r2",
          "astro/zod",
        ],
      },
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
