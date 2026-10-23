import { actions } from "astro:actions";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What one group's page writes. The page reads on the server with `readGroupPage`
 * (src/lib/group-db.ts). Members are named by a stand-in `handle`, never by account id,
 * and every call is checked in the database against who is in the group.
 */
export const setGoing = async (groupId: string, going: boolean | null) =>
  unwrap(await actions.groups.setGoing({ groupId, going })) as Simple;

export const vote = async (pollId: string, optionId: string | null) =>
  unwrap(await actions.groups.vote({ pollId, optionId })) as Simple;

export const createPoll = async (groupId: string, question: string, options: string[]) =>
  unwrap(await actions.groups.createPoll({ groupId, question, options })) as Simple;

export const blockMember = async (groupId: string, handle: string) =>
  unwrap(await actions.groups.block({ groupId, handle })) as Simple;

export type ReportReason = "unsafe" | "harassment" | "spam" | "fake" | "underage" | "other";

export const reportMember = async (groupId: string, handle: string, reason: ReportReason) =>
  unwrap(await actions.groups.report({ groupId, handle, reason })) as Simple;

export const friendMember = async (groupId: string, handle: string) =>
  unwrap(await actions.groups.friend({ groupId, handle })) as { ok: true; status: string } | { ok: false; error: string };
