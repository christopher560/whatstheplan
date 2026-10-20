// @ts-check
import { defineConfig, envField, fontProviders } from "astro/config";
import vercel from "@astrojs/vercel";
import sitemap from "@astrojs/sitemap";
import { SITE_URL } from "./src/consts.ts";
import { isNoindexRoute } from "./src/utils/seo.ts";

export default defineConfig({
  site: SITE_URL,
  // Pages are static unless they say `export const prerender = false`. The app
  // pages do, because they depend on who is signed in.
  adapter: vercel(),
  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: "client", access: "public" }),
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: envField.string({ context: "client", access: "public" }),
    },
  },
  integrations: [
    sitemap({
      filter: (page) => !isNoindexRoute(new URL(page).pathname),
    }),
  ],
  fonts: [
    {
      name: "Plus Jakarta Sans",
      cssVariable: "--font-plus-jakarta-sans",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: "200 800",
            style: "normal",
            src: ["./src/assets/fonts/plus-jakarta-sans.ttf"],
          },
        ],
      },
    },
    {
      name: "Milkyway",
      cssVariable: "--font-milkyway",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: ["./src/assets/fonts/milkyway-demo.ttf"],
          },
        ],
      },
    },
    {
      name: "Bricolage Grotesque",
      cssVariable: "--font-bricolage-grotesque",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: "200 800",
            style: "normal",
            src: ["./src/assets/fonts/bricolage-grotesque.ttf"],
          },
        ],
      },
    },
  ],
  vite: { build: { cssTarget: "safari15.4" } },
});
