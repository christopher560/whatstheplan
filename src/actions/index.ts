import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { safeNext } from "@/utils/safe-next.ts";
import { incomplete, profileSchema } from "@/lib/profile-schema.ts";
import { profileRow } from "@/lib/profile-db.ts";

/** What the auth pages get back. Expected problems are returned, not thrown. */
type Result =
  | { ok: true; next: string }
  /** A 6-digit code was emailed (`sent` is false when none was: they must ask for one). */
  | { ok: true; checkEmail: true; sent?: boolean }
  | { ok: false; error: string };

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
/** Supabase caps passwords at 72 characters. */
const password = z.string().min(8).max(72);
const next = z.string().max(500).optional();
/** The hCaptcha token. Supabase checks it when CAPTCHA protection is on. */
const captchaToken = z.string().max(4000).optional();
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
    case "captcha_failed":
      return "Please tick the CAPTCHA box and try again.";
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
      input: z.object({ email, password, next, captchaToken }),
      handler: async (input, context): Promise<Result> => {
        const { data, error } = await context.locals.supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: { captchaToken: input.captchaToken },
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
      input: z.object({ email, password: z.string().min(1).max(72), next, captchaToken }),
      handler: async (input, context): Promise<Result> => {
        const { supabase } = context.locals;
        const { data, error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
          options: { captchaToken: input.captchaToken },
        });

        /* Signed up but never typed the code. The CAPTCHA token was just used up, so
         * no email is sent here: the page asks them to request a code with a new one. */
        if (error?.code === "email_not_confirmed") return { ok: true, checkEmail: true, sent: false };
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
      input: z.object({ email, purpose, captchaToken }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { supabase } = context.locals;
        const { captchaToken } = input;
        const { error } =
          input.purpose === "signup"
            ? await supabase.auth.resend({ type: "signup", email: input.email, options: { captchaToken } })
            : await supabase.auth.resetPasswordForEmail(input.email, { captchaToken });
        return error ? { ok: false, error: friendly(error) } : { ok: true };
      },
    }),

    /** Emails a reset code. Always answers ok, so the page never reveals whether an email has an account. */
    requestPasswordReset: defineAction({
      accept: "json",
      input: z.object({ email, captchaToken }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { error } = await context.locals.supabase.auth.resetPasswordForEmail(input.email, {
          captchaToken: input.captchaToken,
        });
        if (
          error?.code === "captcha_failed" ||
          error?.code === "over_email_send_rate_limit" ||
          error?.code === "over_request_rate_limit"
        ) {
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
    /**
     * Saves the answers so far and how far setup got. Drafts may be incomplete,
     * but finishing (`onboarded: true`) needs a complete profile. Once someone is
     * onboarded they stay onboarded, even if they walk through setup again.
     */
    save: defineAction({
      accept: "json",
      input: z.object({
        profile: profileSchema,
        onboarding_step: z.number().int().min(0).max(20),
        onboarded: z.boolean(),
      }),
      handler: async (input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });

        if (input.onboarded) {
          const missing = incomplete(input.profile);
          if (missing) throw new ActionError({ code: "BAD_REQUEST", message: missing });
        }

        /* Keep the first time the guidelines were accepted. */
        const { data: before } = await supabase
          .from("profiles")
          .select("guidelines_accepted_at")
          .eq("id", user.id)
          .maybeSingle();
        const acceptedAt = input.profile.guidelines_accepted
          ? (before?.guidelines_accepted_at ?? new Date().toISOString())
          : null;

        const { error } = await supabase
          .from("profiles")
          .update({
            ...profileRow(input.profile),
            guidelines_accepted_at: acceptedAt,
            onboarding_step: input.onboarding_step,
            ...(input.onboarded ? { onboarded: true } : {}),
          })
          .eq("id", user.id);
        if (error) throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        return { ok: true as const };
      },
    }),
  },

  account: {
    /** Saves edits from the account page. The profile must be complete. */
    updateProfile: defineAction({
      accept: "json",
      input: z.object({ profile: profileSchema }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const missing = incomplete(input.profile);
        if (missing) return { ok: false, error: missing };

        const { error } = await supabase
          .from("profiles")
          .update(profileRow(input.profile))
          .eq("id", user.id);
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** Checks the current password first, so a borrowed session cannot change it. */
    changePassword: defineAction({
      accept: "json",
      input: z.object({ current: z.string().min(1).max(72), next: password }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user?.email) throw new ActionError({ code: "UNAUTHORIZED" });

        /* Signing in again would need a CAPTCHA, so the check runs in the database. */
        const { data: matches } = await supabase.rpc("check_my_password", { candidate: input.current });
        if (!matches) return { ok: false, error: "Your current password is wrong." };
        const { error } = await supabase.auth.updateUser({ password: input.next });
        return error ? { ok: false, error: friendly(error) } : { ok: true };
      },
    }),

    /** Deletes the signed-in person's account and, through the foreign key, their profile. */
    deleteAccount: defineAction({
      accept: "json",
      handler: async (_input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("delete_my_account");
        if (error) return { ok: false, error: generic };
        await supabase.auth.signOut();
        return { ok: true };
      },
    }),
  },
};
