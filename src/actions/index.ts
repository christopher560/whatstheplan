import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { safeNext } from "@/utils/safe-next.ts";
import { incomplete, profileSchema } from "@/lib/profile-schema.ts";
import { profileRow } from "@/lib/profile-db.ts";
import { cleanUsername, usernameProblem } from "@/utils/username.ts";
import { accentHex } from "@/utils/avatar-accent.ts";

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
        /* Finishing setup gives the person their @username, so friend links work from day one. */
        if (input.onboarded) await supabase.rpc("ensure_my_username");
        return { ok: true as const };
      },
    }),
  },

  calendar: {
    /** Replaces one week of painted hours. An empty week stays saved as empty. */
    saveAvailability: defineAction({
      accept: "json",
      input: z.object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        /** Keys are `weekday-hour`: weekday 0 to 6, hour 8 to 23. */
        cells: z.record(z.string().regex(/^[0-6]-(?:[89]|1\d|2[0-3])$/), z.enum(["free", "busy"])),
      }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });

        /* A Monday, from a few days back (clock differences) to the last week the calendar opens. */
        const start = new Date(`${input.weekStart}T12:00:00Z`);
        const today = new Date();
        const days = (start.getTime() - today.getTime()) / 86_400_000;
        if (Number.isNaN(start.getTime()) || start.getUTCDay() !== 1 || days < -8 || days > 7 * 8 + 1) {
          return { ok: false, error: "That week can't be edited." };
        }

        const rows = Object.entries(input.cells).map(([key, state]) => {
          const [weekday, hour] = key.split("-").map(Number);
          return { weekday, hour, state };
        });
        const { error } = await supabase.rpc("save_availability_week", {
          p_week_start: input.weekStart,
          p_cells: rows,
        });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    saveShare: defineAction({
      accept: "json",
      input: z.object({ share: z.boolean() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase
          .from("profiles")
          .update({ calendar_shared: input.share })
          .eq("id", user.id);
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),
  },

  friends: {
    /** Asks someone to be friends by their exact username. Never reveals more than whether it worked. */
    sendRequest: defineAction({
      accept: "json",
      input: z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/) }),
      handler: async (input, context): Promise<{ ok: true; status: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("send_friend_request", { p_username: input.username });
        if (error || typeof data !== "string") return { ok: false, error: generic };
        return { ok: true, status: data };
      },
    }),

    /** Accepts or declines a request someone sent. */
    respond: defineAction({
      accept: "json",
      input: z.object({ friendId: z.uuid(), accept: z.boolean() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("respond_friend_request", {
          p_other: input.friendId,
          p_accept: input.accept,
        });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    setFavorite: defineAction({
      accept: "json",
      input: z.object({ friendId: z.uuid(), favorite: z.boolean() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_friend_favorite", {
          p_friend: input.friendId,
          p_favorite: input.favorite,
        });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** Private labels. Only the person who wrote them ever sees them. */
    setTags: defineAction({
      accept: "json",
      input: z.object({
        friendId: z.uuid(),
        tags: z.array(z.string().trim().min(1).max(20)).max(8),
      }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_friend_tags", {
          p_friend: input.friendId,
          p_tags: [...new Set(input.tags)],
        });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    setCircle: defineAction({
      accept: "json",
      input: z.object({ friendIds: z.array(z.uuid()).max(6) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_circle", { p_ids: input.friendIds });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),
  },

  plans: {
    /** Makes a plan and invites friends (by id) and guests (by name, who reply through the link). */
    create: defineAction({
      accept: "json",
      input: z.object({
        kind: z.enum(["hangout", "casual", "event", "formal", "school"]),
        vibe: z.enum(["chill", "chaotic", "cozy", "fancy", "outdoorsy", "broke"]),
        budgetTier: z.number().int().min(0).max(3),
        title: z.string().trim().min(1).max(40),
        description: z.string().trim().max(200),
        place: z.string().trim().max(60),
        when: z.string().trim().max(60),
        friendIds: z.array(z.uuid()).max(30),
        guestNames: z.array(z.string().trim().min(1).max(24)).max(20),
      }),
      handler: async (input, context): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("create_plan", {
          p_kind: input.kind,
          p_vibe: input.vibe,
          p_budget: input.budgetTier,
          p_title: input.title,
          p_description: input.description,
          p_place: input.place,
          p_when: input.when,
          p_friends: input.friendIds,
          p_guests: input.guestNames,
        });
        const made = Array.isArray(data) ? data[0] : data;
        if (error || !made?.id) {
          return {
            ok: false,
            error: error?.message === "Too many plans" ? "You've made a lot of plans. Try again in a bit." : generic,
          };
        }
        return { ok: true, id: made.id, slug: made.slug };
      },
    }),

    /** A friend answers an invite, or takes the answer back with null. */
    answer: defineAction({
      accept: "json",
      input: z.object({ memberId: z.uuid(), reply: z.enum(["in", "maybe", "out"]).nullable() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("answer_plan", { p_member: input.memberId, p_reply: input.reply });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    setDescription: defineAction({
      accept: "json",
      input: z.object({ planId: z.uuid(), text: z.string().trim().max(200) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_plan_description", { p_plan: input.planId, p_text: input.text });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    postUpdate: defineAction({
      accept: "json",
      input: z.object({ planId: z.uuid(), text: z.string().trim().min(1).max(120) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("post_plan_update", { p_plan: input.planId, p_text: input.text });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    setAutoNudge: defineAction({
      accept: "json",
      input: z.object({ planId: z.uuid(), on: z.boolean() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_plan_auto_nudge", { p_plan: input.planId, p_on: input.on });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),
  },

  invite: {
    /**
     * A reply from the public invite page. A signed-in person replies as themselves;
     * anyone else is a guest, who gets a secret link (`/r/{token}`) to change the reply later.
     */
    reply: defineAction({
      accept: "json",
      input: z.object({
        slug: z.string().regex(/^[a-z0-9-]{8,80}$/),
        rsvp: z.enum(["in", "maybe", "out"]),
        name: z.string().trim().max(24).optional(),
        color: z.enum(["red", "orange", "yellow", "green", "blue", "purple", "pink"]).optional(),
        comfortDollars: z.number().int().min(0).max(9999).optional(),
        plusOne: z.string().trim().max(24).optional(),
        token: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      }),
      handler: async (input, context): Promise<{ ok: true; path: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        const reason = (message?: string) => {
          if (message === "This plan is full") return "This plan is full.";
          if (message === "Too many new guests") return "Lots of people are joining right now. Try again in a few minutes.";
          if (message === "This is your plan") return "This is your own plan.";
          if (message === "Name needed") return "Add your name.";
          return generic;
        };

        if (user) {
          const { error } = await supabase.rpc("member_reply", {
            p_slug: input.slug,
            p_reply: input.rsvp,
            p_comfort: input.comfortDollars ?? null,
            p_plus: input.plusOne ?? null,
          });
          return error ? { ok: false, error: reason(error.message) } : { ok: true, path: "/app/plans" };
        }

        const { data, error } = await supabase.rpc("guest_reply", {
          p_slug: input.slug,
          p_name: input.name ?? "",
          p_color: input.color ? accentHex(input.color) : null,
          p_reply: input.rsvp,
          p_comfort: input.comfortDollars ?? null,
          p_plus: input.plusOne ?? null,
          p_token: input.token ?? null,
        });
        if (error || typeof data !== "string") return { ok: false, error: reason(error?.message) };
        return { ok: true, path: `/r/${data}` };
      },
    }),
  },

  account: {
    /** Whether a username is free. Someone's own current username counts as free. */
    checkUsername: defineAction({
      accept: "json",
      input: z.object({ username: z.string().max(40) }),
      handler: async (input, context): Promise<{ ok: true; available: boolean; problem: string | null }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const username = cleanUsername(input.username);
        const problem = usernameProblem(username);
        if (problem) return { ok: true, available: false, problem };
        const { data } = await supabase.rpc("profile_by_username", { p_username: username });
        return { ok: true, available: !data?.length, problem: null };
      },
    }),

    /** Changes the person's username, and so their add-friend link. There is no limit on changes. */
    setUsername: defineAction({
      accept: "json",
      input: z.object({ username: z.string().max(40) }),
      handler: async (input, context): Promise<{ ok: true; username: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const username = cleanUsername(input.username);
        const problem = usernameProblem(username);
        if (problem) return { ok: false, error: problem };
        const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);
        if (error?.code === "23505") return { ok: false, error: "That username is taken." };
        return error ? { ok: false, error: generic } : { ok: true, username };
      },
    }),

    /** Saves edits from the account page. The profile must be complete. */
    updateProfile: defineAction({
      accept: "json",
      input: z.object({ profile: profileSchema }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const missing = incomplete(input.profile, false);
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
