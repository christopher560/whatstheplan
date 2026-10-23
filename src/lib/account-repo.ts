import { actions } from "astro:actions";
import type { Profile } from "@/lib/onboarding-repo.ts";

export type PasswordResult = { ok: true } | { ok: false; error: string };
type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

/** An action call returns `{ data, error }`; an error here means the request itself failed. */
const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the account page writes. The page reads the profile on the server with
 * `readProfile` (src/lib/profile-db.ts); these calls go to Astro Actions
 * (src/actions/index.ts), which check the rules again and write `profiles`.
 */
export const updateProfile = async (profile: Profile) =>
  unwrap(await actions.account.updateProfile({ profile })) as Simple;

/** Re-checks the current password, then sets the new one. */
export const changePassword = async (input: { current: string; next: string }) =>
  unwrap(await actions.account.changePassword(input)) as PasswordResult;

/** Deletes the account and signs out. */
export const deleteAccount = async () =>
  unwrap(await actions.account.deleteAccount()) as Simple;

/** Whether a username is free, and why not when it is not. */
export const checkUsername = async (username: string) =>
  unwrap(await actions.account.checkUsername({ username })) as
    | { ok: true; available: boolean; problem: string | null }
    | typeof failed;

/** Saves a new username. The add-friend link changes with it. */
export const setUsername = async (username: string) =>
  unwrap(await actions.account.setUsername({ username })) as
    | { ok: true; username: string }
    | typeof failed
    | { ok: false; error: string };


/** Saves the person's town from a US ZIP code. */
export const saveLocationFromZip = async (zip: string) =>
  unwrap(await actions.account.locationFromZip({ zip })) as { ok: true; label: string } | typeof failed | { ok: false; error: string };

export const removeLocation = async () => unwrap(await actions.account.clearLocation()) as Simple;

/** How far around their spot Discover looks, in miles. */
export const saveRadius = async (miles: 5 | 10 | 25) => unwrap(await actions.account.setRadius({ miles })) as Simple;
