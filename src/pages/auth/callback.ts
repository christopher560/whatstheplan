import type { APIRoute } from "astro";
import { safeNext } from "@/utils/safe-next.ts";

export const prerender = false;

/**
 * Where the links in Supabase's emails land (confirm sign-up, reset password).
 * Swaps the one-time `code` for a session cookie, then opens `next`.
 */
export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/app/dashboard");

  if (code) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(next);
  }
  return redirect("/login?error=link");
};
