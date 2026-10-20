import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { safeNext } from "@/utils/safe-next.ts";

/** What the auth pages get back. Expected problems are returned, not thrown. */
type Result =
  | { ok: true; next: string }
  | { ok: true; checkEmail: true }
  | { ok: false; error: string };

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
/** Supabase caps passwords at 72 characters. */
const password = z.string().min(8).max(72);
const next = z.string().max(500).optional();

const generic = "Something went wrong. Please try again.";

const friendly = (error: { code?: string; message: string }): string => {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match.";
    case "email_not_confirmed":
      return "Confirm your email first. We sent you a link when you signed up.";
    case "weak_password":
      return "Choose a stronger password.";
    case "same_password":
      return "Choose a password you haven't used before.";
    case "email_address_invalid":
      return "That email address doesn't look right.";
    case "email_address_not_authorized":
      return "We can't email that address yet. Try another one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many tries right now. Please wait a little and try again.";
    default:
      return generic;
  }
};

const callback = (origin: string, to: string) =>
  `${origin}/auth/callback?next=${encodeURIComponent(to)}`;

export const server = {
  auth: {
    signUp: defineAction({
      accept: "json",
      input: z.object({ email, password, next }),
      handler: async (input, context): Promise<Result> => {
        const { data, error } = await context.locals.supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: callback(context.url.origin, safeNext(input.next, "/app/onboarding")),
          },
        });
        if (error) return { ok: false, error: friendly(error) };
        /* With email confirmation on there is no session yet. An address that
         * already has an account looks identical, so nobody can probe for emails. */
        if (!data.session) return { ok: true, checkEmail: true };
        return { ok: true, next: "/app/onboarding" };
      },
    }),

    logIn: defineAction({
      accept: "json",
      input: z.object({ email, password: z.string().min(1).max(72), next }),
      handler: async (input, context): Promise<Result> => {
        const { supabase } = context.locals;
        const { data, error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (error || !data.user) return { ok: false, error: friendly(error ?? { message: "" }) };

        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq("id", data.user.id)
          .maybeSingle();
        return {
          ok: true,
          next: profile?.onboarded ? safeNext(input.next, "/app/dashboard") : "/app/onboarding",
        };
      },
    }),

    /** Always answers ok, so the page never reveals whether an email has an account. */
    requestPasswordReset: defineAction({
      accept: "json",
      input: z.object({ email }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { error } = await context.locals.supabase.auth.resetPasswordForEmail(input.email, {
          redirectTo: callback(context.url.origin, "/reset-password"),
        });
        if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
          return { ok: false, error: friendly(error) };
        }
        return { ok: true };
      },
    }),

    /** Sets a new password for the signed-in person (the reset link signs them in first). */
    updatePassword: defineAction({
      accept: "json",
      input: z.object({ password }),
      handler: async (input, context): Promise<Result> => {
        if (!context.locals.user) return { ok: false, error: "That link has expired. Request a new one." };
        const { error } = await context.locals.supabase.auth.updateUser({ password: input.password });
        if (error) return { ok: false, error: friendly(error) };
        return { ok: true, next: "/app/dashboard" };
      },
    }),

    logOut: defineAction({
      accept: "json",
      handler: async (_input, context): Promise<{ ok: true; next: string }> => {
        await context.locals.supabase.auth.signOut();
        return { ok: true, next: "/login" };
      },
    }),
  },

  onboarding: {
    /** Saves how far setup got. The answers themselves are stored in the next round. */
    saveProgress: defineAction({
      accept: "json",
      input: z.object({ onboarding_step: z.number().int().min(0).max(20), onboarded: z.boolean() }),
      handler: async (input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase
          .from("profiles")
          .update({ onboarding_step: input.onboarding_step, onboarded: input.onboarded })
          .eq("id", user.id);
        if (error) throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return { ok: true as const };
      },
    }),
  },
};
