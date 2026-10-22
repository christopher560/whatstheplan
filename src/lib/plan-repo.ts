import { actions } from "astro:actions";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the host's plan page writes. The page reads the plan on the server with
 * `readPlan` (src/lib/plans-db.ts). Only the host can change a plan; the database
 * functions check that. Nudging and locking a time need times to vote on and
 * reminders to send, which come in a later round, so they save nothing yet.
 */
export const nudge = async (_planId: string, _friendIds: string[]) => {};
export const lockTime = async (_planId: string, _slotId: string | null) => {};

export const setAutoNudge = async (planId: string, on: boolean) =>
  unwrap(await actions.plans.setAutoNudge({ planId, on })) as Simple;
export const saveDescription = async (planId: string, text: string) =>
  unwrap(await actions.plans.setDescription({ planId, text })) as Simple;
export const sendUpdate = async (planId: string, message: string) =>
  unwrap(await actions.plans.postUpdate({ planId, text: message })) as Simple;
