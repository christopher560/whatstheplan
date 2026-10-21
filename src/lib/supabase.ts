import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from "astro:env/client";

/**
 * A Supabase client for one request. Reads the session from the request's
 * cookies and writes refreshed ones back through Astro, so the session follows
 * the browser without any token handling in page scripts.
 */
export const createSupabase = (request: Request, cookies: AstroCookies) =>
  createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        })),
      setAll: (list) =>
        list.forEach(({ name, value, options }) =>
          cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: "lax",
            secure: !import.meta.env.DEV,
          }),
        ),
    },
  });
