import { defineMiddleware } from "astro:middleware";
import { createSupabase } from "@/lib/supabase.ts";

/** Pages that only make sense signed out. People who are signed in go to the app instead. */
const signedOutOnly = new Set(["/login", "/signup"]);

/**
 * Runs on every request that is not prerendered. It builds the request's
 * Supabase client, checks who is signed in (with Supabase, not just the
 * cookie), and sends people where they belong:
 *
 * - signed out and opening /app/*  ->  /login?next=...
 * - signed in and opening /login or /signup  ->  the app
 * - signed in but not onboarded and opening any /app page except onboarding  ->  onboarding
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();

  const { request, cookies, url, locals, redirect } = context;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const supabase = createSupabase(request, cookies);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  locals.supabase = supabase;
  locals.user = user;
  locals.onboarded = null;
  locals.profile = null;

  const inApp = path === "/app" || path.startsWith("/app/");
  const needsSession = inApp;

  if (needsSession && !user) {
    const target = encodeURIComponent(`${path}${url.search}`);
    return redirect(`/login?next=${target}`);
  }

  if (user && (inApp || signedOutOnly.has(path))) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("onboarded, first_name, avatar_color")
      .eq("id", user.id)
      .maybeSingle();
    /* A missing row means setup has not started. A failed read says nothing, so
     * it leaves the person where they are rather than bouncing them in a loop. */
    locals.onboarded = error ? null : (profile?.onboarded ?? false);
    locals.profile = profile ? { first_name: profile.first_name, avatar_color: profile.avatar_color } : null;

    if (signedOutOnly.has(path)) {
      return redirect(locals.onboarded === false ? "/app/onboarding" : "/app/dashboard");
    }
    if (locals.onboarded === false && path !== "/app/onboarding") return redirect("/app/onboarding");
  }

  const response = await next();
  if (needsSession || signedOutOnly.has(path)) {
    /* Pages that depend on the session must never be shared by a cache. */
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
