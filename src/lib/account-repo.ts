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
