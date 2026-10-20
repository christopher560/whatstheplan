import { actions } from "astro:actions";

export { safeNext } from "@/utils/safe-next.ts";

/**
 * What the auth pages send and get back. The calls go to Astro Actions
 * (`src/actions/index.ts`), which talk to Supabase on the server and set the
 * session cookie, so no password or token is ever handled by page scripts.
 */
export type AuthResult =
  /** Signed in. `next` is the page to open. */
  | { ok: true; next: string }
  /** An email was sent. The person finishes by opening the link in it. */
  | { ok: true; checkEmail: true }
  | { ok: false; error: string };

export type AuthMode = "login" | "signup" | "reset";

export interface Credentials {
  email: string;
  password: string;
}

const failed: AuthResult = { ok: false, error: "Something went wrong. Please try again." };

/** An action call returns `{ data, error }`; an error here means the request itself failed. */
const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | AuthResult =>
  error || data === undefined ? failed : data;

/** Creates the account. With email confirmation on, the result asks them to check their email. */
export const signUp = async (input: Credentials & { next?: string }) =>
  unwrap(await actions.auth.signUp(input)) as AuthResult;

/** Signs in with a password. People who have not finished onboarding go there first. */
export const logIn = async (input: Credentials & { next?: string }) =>
  unwrap(await actions.auth.logIn(input)) as AuthResult;

/** Emails a reset link. The answer never says whether the email has an account. */
export const requestPasswordReset = async (input: { email: string }) =>
  unwrap(await actions.auth.requestPasswordReset(input)) as { ok: true } | { ok: false; error: string };

/** Sets a new password for the person the reset link signed in. */
export const updatePassword = async (input: { password: string }) =>
  unwrap(await actions.auth.updatePassword(input)) as AuthResult;

/** Ends the session and returns where to go. */
export const logOut = async () =>
  unwrap(await actions.auth.logOut()) as { ok: true; next: string } | { ok: false; error: string };

/** Google sign-in is designed but not connected yet; it needs a Google OAuth client. */
export const signInWithGoogle = async (_input: { mode: AuthMode; next?: string }): Promise<AuthResult> => ({
  ok: false,
  error: "Google sign-in is coming soon. Use your email for now.",
});
