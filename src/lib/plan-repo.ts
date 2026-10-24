import { actions } from "astro:actions";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the host's plan page writes. The page reads the plan on the server with
 * `readPlan` (src/lib/plans-db.ts). Only the host can change a plan; the database
 * functions check that.
 */
export const lockTime = async (planId: string, slotId: string | null) =>
  unwrap(await actions.plans.lockSlot({ planId, slotId })) as Simple;

/** The host asks someone in the plan to be friends. */
export const addMemberFriend = async (memberId: string) =>
  unwrap(await actions.plans.addMemberFriend({ memberId })) as { ok: true; status: string } | { ok: false; error: string };

export const saveDescription = async (planId: string, text: string) =>
  unwrap(await actions.plans.setDescription({ planId, text })) as Simple;
export const sendUpdate = async (planId: string, message: string) =>
  unwrap(await actions.plans.postUpdate({ planId, text: message })) as Simple;
