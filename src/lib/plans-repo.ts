import { actions } from "astro:actions";
import type { InviteReply } from "@/data/plans-hub.ts";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

/** An action call returns `{ data, error }`; an error here means the request itself failed. */
const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the plans pages write from the browser. The pages read plans on the
 * server with `src/lib/plans-db.ts`; these calls go to Astro Actions, which call
 * database functions that only act for the signed-in person.
 */

export interface NewPlan {
  kind: "hangout" | "casual" | "event" | "formal" | "school";
  vibe: "chill" | "chaotic" | "cozy" | "fancy" | "outdoorsy" | "broke";
  budgetTier: number;
  title: string;
  description: string;
  place: string;
  when: string;
  /** Friends with the app, by profile id. */
  friendIds: string[];
  /** Names of people without the app; they reply through the link. */
  guestNames: string[];
}

export const createPlan = async (plan: NewPlan) =>
  unwrap(await actions.plans.create(plan)) as ({ ok: true; id: string; slug: string } | { ok: false; error: string });

/** Saves the answer to an invite, or clears it with `null`. */
export const answerInvite = async (inviteId: string, reply: InviteReply | null) =>
  unwrap(await actions.plans.answer({ memberId: inviteId, reply })) as Simple;

/** Not saved yet: plans reach the calendar in a later round. */
export const setOnCalendar = async (_planId: string, _added: boolean) => {};

/** Not saved yet: it comes with Discover groups. */
export const setFriendRequest = async (_personName: string, _sent: boolean) => {};
