import { actions } from "astro:actions";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the Discover page writes. The page reads on the server with `readDiscover`
 * (src/lib/discover-db.ts). Joining checks the age band, blocks and the last spot
 * in the database, so these can say no.
 */
export const joinGroup = async (groupId: string) => unwrap(await actions.discover.join({ groupId })) as Simple;
export const leaveGroup = async (groupId: string) => unwrap(await actions.discover.leave({ groupId })) as Simple;

export interface NewGroup {
  title: string;
  category: "outdoors" | "games" | "food" | "create" | "active" | "chill";
  /** Interest ids from onboarding. */
  tags: string[];
  purpose: string;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
  placeId: string;
  capacity: number;
  minPeople: number;
  newcomerFriendly: boolean;
}

export const createGroup = async (group: NewGroup) =>
  unwrap(await actions.discover.create(group)) as { ok: true; id: string } | { ok: false; error: string };
