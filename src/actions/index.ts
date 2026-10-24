import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { safeNext } from "@/utils/safe-next.ts";
import { incomplete, profileSchema } from "@/lib/profile-schema.ts";
import { profileRow } from "@/lib/profile-db.ts";
import { cleanUsername, usernameProblem } from "@/utils/username.ts";
import { accentHex } from "@/utils/avatar-accent.ts";
import { countPending, readHub, readPlan } from "@/lib/plans-db.ts";
import { countFriendRequests } from "@/lib/friends-db.ts";
import { readGroupPage } from "@/lib/group-db.ts";
import { readDiscover } from "@/lib/discover-db.ts";
import { nowFor } from "@/utils/now.ts";

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

const locationProblem = (message: string) =>
  message === "Too many tries" ? "Too many tries. Please wait a little and try again." : generic;

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
        /** The host's time zone, so every guest reads times the same way. */
        tz: z.string().max(64),
        /** Times to vote on, as ISO instants. */
        slots: z.array(z.iso.datetime()).max(5),
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
          p_tz: input.tz,
          p_slots: input.slots,
        });
        const made = Array.isArray(data) ? data[0] : data;
        if (error || !made?.id) {
          return {
            ok: false,
            error:
              error?.message === "Too many plans"
                ? "You've made a lot of plans. Try again in a bit."
                : error?.message === "Bad time"
                  ? "One of those times is too far away or already past."
                  : generic,
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

    /** Puts a plan on the person's in-app calendar, or takes it off. */
    pin: defineAction({
      accept: "json",
      input: z.object({ planId: z.uuid(), on: z.boolean() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_plan_pin", { p_plan: input.planId, p_on: input.on });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** The host asks someone in the plan (who has an account) to be friends. */
    addMemberFriend: defineAction({
      accept: "json",
      input: z.object({ memberId: z.uuid() }),
      handler: async (input, context): Promise<{ ok: true; status: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("add_plan_member_friend", { p_member: input.memberId });
        return error || typeof data !== "string" ? { ok: false, error: generic } : { ok: true, status: data };
      },
    }),

    /** Locks one of the proposed times in, or takes the lock off with null. */
    lockSlot: defineAction({
      accept: "json",
      input: z.object({ planId: z.uuid(), slotId: z.uuid().nullable() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("lock_plan_slot", { p_plan: input.planId, p_slot: input.slotId });
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
        /** The proposed times this person can do. Leave out to keep earlier votes. */
        slotIds: z.array(z.uuid()).max(5).optional(),
        /** A short note about times, for the host. */
        timeNote: z.string().trim().max(120).optional(),
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
            p_slots: input.slotIds ?? null,
          });
          if (error) return { ok: false, error: reason(error.message) };
          if (input.timeNote) await supabase.rpc("member_note", { p_slug: input.slug, p_note: input.timeNote });
          return { ok: true, path: "/app/plans" };
        }

        const { data, error } = await supabase.rpc("guest_reply", {
          p_slug: input.slug,
          p_name: input.name ?? "",
          p_color: input.color ? accentHex(input.color) : null,
          p_reply: input.rsvp,
          p_comfort: input.comfortDollars ?? null,
          p_plus: input.plusOne ?? null,
          p_token: input.token ?? null,
          p_slots: input.slotIds ?? null,
        });
        if (error || typeof data !== "string") return { ok: false, error: reason(error?.message) };
        if (input.timeNote) await supabase.rpc("guest_note", { p_token: data, p_note: input.timeNote });
        return { ok: true, path: `/r/${data}` };
      },
    }),
  },

  inviteAccount: {
    /** Someone in the plan asks its host to be friends. */
    addHost: defineAction({
      accept: "json",
      input: z.object({ slug: z.string().regex(/^[a-z0-9-]{8,80}$/) }),
      handler: async (input, context): Promise<{ ok: true; status: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("add_plan_host", { p_slug: input.slug });
        return error || typeof data !== "string" ? { ok: false, error: generic } : { ok: true, status: data };
      },
    }),

    /** A guest with an account attaches their reply to it. Returns the plan's slug. */
    claimReply: defineAction({
      accept: "json",
      input: z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }),
      handler: async (input, context): Promise<{ ok: true; slug: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("claim_guest_reply", { p_token: input.token });
        return error || typeof data !== "string" ? { ok: false, error: generic } : { ok: true, slug: data };
      },
    }),
  },

  /** Fresh data for open pages. Each call returns what the page would show if it were loaded now. */
  live: {
    /** A tiny fingerprint of a page's data. The page fetches the full data only when this changes. */
    pulse: defineAction({
      accept: "json",
      input: z.object({ kind: z.enum(["plan", "group", "discover", "plans", "chat"]), id: z.uuid().optional() }),
      handler: async (input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data } = await supabase.rpc("live_pulse", { p_kind: input.kind, p_id: input.id ?? null });
        return { pulse: typeof data === "string" ? data : null };
      },
    }),

    badges: defineAction({
      accept: "json",
      handler: async (_input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const [plans, friends] = await Promise.all([countPending(supabase, user.id), countFriendRequests(supabase, user.id)]);
        return { plans, friends };
      },
    }),

    plan: defineAction({
      accept: "json",
      input: z.object({ planId: z.uuid() }),
      handler: async (input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        return { plan: await readPlan(supabase, user.id, input.planId) };
      },
    }),

    group: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid() }),
      handler: async (input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        return { group: await readGroupPage(supabase, input.groupId, context.cookies.get("tz")?.value, false) };
      },
    }),

    discover: defineAction({
      accept: "json",
      handler: async (_input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const result = await readDiscover(supabase, user.id, context.cookies.get("tz")?.value, nowFor(context.cookies));
        return result.status === "ok" ? { data: result.data } : { data: null };
      },
    }),

    /** Only the parts of the Plans page that need a refresh to show: who is on it and the group lines. */
    plans: defineAction({
      accept: "json",
      handler: async (_input, context) => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const hub = await readHub(supabase, user.id, context.cookies.get("tz")?.value);
        return {
          hosting: hub.hosting.map((plan) => [plan.id, plan.replied, plan.invited, plan.stage]),
          invites: hub.invites.map((invite) => [invite.id, invite.who, invite.stage]),
          groups: hub.groups.map((group) => [group.id, group.statusLabel, group.members.length, group.last, group.unread, group.vote]),
        };
      },
    }),
  },

  groups: {
    /** The viewer's answer to the group's plan: yes, can't make it, or null to clear it. */
    setGoing: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid(), going: z.boolean().nullable() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_group_going", { p_group: input.groupId, p_going: input.going });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    vote: defineAction({
      accept: "json",
      input: z.object({ pollId: z.uuid(), optionId: z.uuid().nullable() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("vote_group_poll", { p_poll: input.pollId, p_option: input.optionId });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** The person who started the group asks it a question. A new question replaces the old one. */
    createPoll: defineAction({
      accept: "json",
      input: z.object({
        groupId: z.uuid(),
        question: z.string().trim().min(1).max(80),
        options: z.array(z.string().trim().min(1).max(40)).min(2).max(4),
      }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("create_group_poll", {
          p_group: input.groupId,
          p_question: input.question,
          p_options: input.options,
        });
        return error ? { ok: false, error: error.message === "Bad options" ? "Give two to four different answers." : generic } : { ok: true };
      },
    }),

    /** New lines in the group's chat since a line number (0 gives the latest 50). */
    messages: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid(), after: z.number().int().min(0) }),
      handler: async (input, context): Promise<{ ok: true; lines: unknown[] } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("group_messages", { p_group: input.groupId, p_after: input.after });
        return error || !Array.isArray(data) ? { ok: false, error: generic } : { ok: true, lines: data };
      },
    }),

    send: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid(), text: z.string().trim().min(1).max(500) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("send_group_message", { p_group: input.groupId, p_body: input.text });
        return error
          ? { ok: false, error: error.message === "Too many messages" ? "You're sending a lot. Wait a moment and try again." : generic }
          : { ok: true };
      },
    }),

    block: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid(), handle: z.uuid() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("block_group_member", { p_group: input.groupId, p_handle: input.handle });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    report: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid(), handle: z.uuid(), reason: z.enum(["unsafe", "harassment", "spam", "fake", "underage", "other"]) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("report_group_member", {
          p_group: input.groupId,
          p_handle: input.handle,
          p_reason: input.reason,
          p_details: "",
        });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    friend: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid(), handle: z.uuid() }),
      handler: async (input, context): Promise<{ ok: true; status: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("friend_request_group_member", {
          p_group: input.groupId,
          p_handle: input.handle,
        });
        return error || typeof data !== "string" ? { ok: false, error: generic } : { ok: true, status: data };
      },
    }),
  },

  discover: {
    /** Takes a spot in a group. The database holds the group while it counts, so the last spot goes to one person. */
    join: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("join_group", { p_group: input.groupId });
        if (error || typeof data !== "string") return { ok: false, error: generic };
        const said: Record<string, string> = {
          full: "That group just filled up.",
          closed: "That group has already started or was cancelled.",
          not_found: "That group isn't available.",
          not_allowed: "Discover isn't open for your age group yet.",
          rate_limited: "Too many tries. Please wait a little and try again.",
        };
        return data === "joined" || data === "already" ? { ok: true } : { ok: false, error: said[data] ?? generic };
      },
    }),

    leave: defineAction({
      accept: "json",
      input: z.object({ groupId: z.uuid() }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("leave_group", { p_group: input.groupId });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** Starts a group at a public place. The database checks the age band, the place and the time again. */
    create: defineAction({
      accept: "json",
      input: z.object({
        title: z.string().trim().min(1).max(60),
        category: z.enum(["outdoors", "games", "food", "create", "active", "chill"]),
        tags: z.array(z.string().regex(/^[a-z0-9-]{1,30}$/)).max(3),
        purpose: z.string().trim().max(200),
        startsAt: z.iso.datetime(),
        endsAt: z.iso.datetime(),
        placeId: z.uuid(),
        capacity: z.number().int().min(3).max(10),
        minPeople: z.number().int().min(2).max(10),
        newcomerFriendly: z.boolean(),
      }),
      handler: async (input, context): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data, error } = await supabase.rpc("create_group", {
          p_title: input.title,
          p_category: input.category,
          p_tags: input.tags,
          p_purpose: input.purpose,
          p_starts: input.startsAt,
          p_ends: input.endsAt,
          p_place: input.placeId,
          p_capacity: input.capacity,
          p_min: input.minPeople,
          p_newcomer: input.newcomerFriendly,
        });
        if (error || typeof data !== "string") {
          const said: Record<string, string> = {
            "Not open to you yet": "Starting groups isn't open for your age group yet.",
            "Too many groups": "You've started a lot of groups today. Try again tomorrow.",
            "Pick a public place": "Pick one of the public places on the list.",
            "Bad time": "Pick a time between half an hour from now and 30 days away.",
            "Bad size": "A group needs between 3 and 10 people.",
          };
          return { ok: false, error: said[error?.message ?? ""] ?? generic };
        }
        return { ok: true, id: data };
      },
    }),
  },

  account: {
    /** Saves the person's town from a US ZIP code: the town's approximate centre, never a precise spot. */
    locationFromZip: defineAction({
      accept: "json",
      input: z.object({ zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code.") }),
      handler: async (input, context): Promise<{ ok: true; label: string } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { data: allowed } = await supabase.rpc("location_lookup_allowed");
        if (allowed !== true) return { ok: false, error: "Too many tries. Please wait a little and try again." };

        let place: { lat: number; lng: number; label: string } | null = null;
        try {
          const response = await fetch(`https://api.zippopotam.us/us/${input.zip}`, { signal: AbortSignal.timeout(5000) });
          if (response.status === 404) return { ok: false, error: "We couldn't find that ZIP code." };
          if (!response.ok) return { ok: false, error: "We couldn't look that up just now. Please try again in a moment." };
          const body = (await response.json()) as {
            places?: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[];
          };
          const first = body.places?.[0];
          if (first) {
            place = {
              lat: Number(first.latitude),
              lng: Number(first.longitude),
              label: `${first["place name"]}, ${first["state abbreviation"]}`,
            };
          }
        } catch {
          return { ok: false, error: "We couldn't look that up just now. Please try again in a moment." };
        }
        if (!place || Number.isNaN(place.lat) || Number.isNaN(place.lng)) {
          return { ok: false, error: "We couldn't find that ZIP code." };
        }
        const { error } = await supabase.rpc("set_my_location", { p_lat: place.lat, p_lng: place.lng, p_label: place.label });
        if (error) return { ok: false, error: locationProblem(error.message) };
        return { ok: true, label: place.label };
      },
    }),

    clearLocation: defineAction({
      accept: "json",
      handler: async (_input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("clear_my_location");
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** How far around their spot Discover looks, in miles: 5, 10 or 25. */
    setRadius: defineAction({
      accept: "json",
      input: z.object({ miles: z.union([z.literal(5), z.literal(10), z.literal(25)]) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const km = { 5: 8, 10: 16, 25: 40 }[input.miles];
        const { error } = await supabase.rpc("set_discover_radius", { p_km: km });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

    /** The monthly hangout budget the person set for themselves, in dollars. */
    setMonthlyBudget: defineAction({
      accept: "json",
      input: z.object({ dollars: z.number().int().min(0).max(5000) }),
      handler: async (input, context): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { user, supabase } = context.locals;
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
        const { error } = await supabase.rpc("set_monthly_budget", { p_dollars: input.dollars });
        return error ? { ok: false, error: generic } : { ok: true };
      },
    }),

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
