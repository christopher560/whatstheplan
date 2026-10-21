import { actions } from "astro:actions";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

/** An action call returns `{ data, error }`; an error here means the request itself failed. */
const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the friends page writes. The page reads friends on the server with
 * `readFriends` (src/lib/friends-db.ts); these calls go to Astro Actions
 * (src/actions/index.ts), which call database functions that only act for the
 * signed-in person. Favorites, labels and the inner circle are private to them.
 */

/** Accepts a friend request, which makes the friendship `accepted`. */
export const acceptRequest = async (friendId: string) =>
  unwrap(await actions.friends.respond({ friendId, accept: true })) as Simple;

/** Declines a friend request. */
export const declineRequest = async (friendId: string) =>
  unwrap(await actions.friends.respond({ friendId, accept: false })) as Simple;

export const setFavorite = async (friendId: string, favorite: boolean) =>
  unwrap(await actions.friends.setFavorite({ friendId, favorite })) as Simple;

/** Replaces the viewer's private labels for a friend. */
export const setTags = async (friendId: string, tags: string[]) =>
  unwrap(await actions.friends.setTags({ friendId, tags })) as Simple;

/** Replaces the friends in the viewer's inner circle. */
export const setCircle = async (friendIds: string[]) =>
  unwrap(await actions.friends.setCircle({ friendIds })) as Simple;

export type RequestStatus =
  | "sent"
  | "accepted"
  | "already_friends"
  | "already_requested"
  | "not_found"
  | "self"
  | "too_many"
  | "rate_limited";

/** Asks someone to be friends by username. */
export const sendFriendRequest = async (username: string) =>
  unwrap(await actions.friends.sendRequest({ username })) as
    | { ok: true; status: RequestStatus }
    | { ok: false; error: string };
