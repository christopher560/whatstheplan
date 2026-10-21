import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { safeNext } from "@/utils/safe-next.ts";

/** What the auth pages get back. Expected problems are returned, not thrown. */
type Result =
  | { ok: true; next: string }
  /** A 6-digit code was emailed. The person finishes by typing it in. */
  | { ok: true; checkEmail: true }
  | { ok: false; error: string };

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
/** Supabase caps passwords at 72 characters. */
const password = z.string().min(8).max(72);
const next = z.string().max(500).optional();
const code = z.string().regex(/^\d{6}$/, "Enter the 6-digit code.");
/** Why a code was sent: confirming a new account, or resetting a password. */
const purpose = z.enum(["signup", "recovery"]);

const generic = "Something went wrong. Please try again.";

const friendly = (error: { code?: string; message: string }): string => {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match.";
    case "otp_expired":
      return "That code is wrong or has expired. Check it or send a new one.";
    case "user_already_exists":
      return "That email already has an account. Try logging in.";
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

export const server = {
  auth: {
    /** Creates the account and emails a 6-digit code (the template shows `{{ .Token }}`). */
    signUp: defineAction({
      accept: "json",
      input: z.object({ email, password, next }),
      handler: async (input, context): Promise<Result> => {
        const { data, error } = await context.locals.supabase.auth.signUp({
          email: input.email,
          password: input.password,
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

        /* Signed up but never typed the code: send a fresh one and let them finish. */
        if (error?.code === "email_not_confirmed") {
          const { error: resendError } = await supabase.auth.resend({
            type: "signup",
            email: input.email,
          });
          return resendError ? { ok: false, error: friendly(resendError) } : { ok: true, checkEmail: true };
        }
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

    /** Checks the 6-digit code. On success the session cookie is set, so the person is signed in. */
    verifyCode: defineAction({
      accept: "json",
      input: z.object({ email, token: code, purpose }),
      handler: async (input, context): Promise<Result> => {
        const { error } = await context.locals.supabase.auth.verifyOtp({
          email: input.email,
          token: input.token,
          type: input.purpose,
        });
        if (error) return { ok: false, error: friendly(error) };
        return { ok: true, next: input.purpose === "signup" ? "/app/onboarding" : "/app/dashboard" };
      },
    }),

    /** Sends a new code. Supabase allows one per minute per address. */
    resendCode: defineAction({
      accept: "json",
      input: z.object({ email, purpose }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { supabase } = context.locals;
        const { error } =
          input.purpose === "signup"
            ? await supabase.auth.resend({ type: "signup", email: input.email })
            : await supabase.auth.resetPasswordForEmail(input.email);
        return error ? { ok: false, error: friendly(error) } : { ok: true };
      },
    }),

    /** Emails a reset code. Always answers ok, so the page never reveals whether an email has an account. */
    requestPasswordReset: defineAction({
      accept: "json",
      input: z.object({ email }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { error } = await context.locals.supabase.auth.resetPasswordForEmail(input.email);
        if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
          return { ok: false, error: friendly(error) };
        }
        return { ok: true };
      },
    }),

    /** Sets a new password for the signed-in person (the reset code signs them in first). */
    updatePassword: defineAction({
      accept: "json",
      input: z.object({ password }),
      handler: async (input, context): Promise<Result> => {
        if (!context.locals.user) return { ok: false, error: "That code has expired. Request a new one." };
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
