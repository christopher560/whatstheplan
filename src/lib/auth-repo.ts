import { actions } from "astro:actions";

export { safeNext } from "@/utils/safe-next.ts";

/**
 * What the auth pages send and get back. The calls go to Astro Actions
 * (`src/actions/index.ts`), which talk to Supabase on the server and set the
 * session cookie, so no password, code or token is ever stored by page scripts.
 */
export type AuthResult =
  /** Signed in. `next` is the page to open. */
  | { ok: true; next: string }
  /** A 6-digit code was emailed (`sent` is false when none was: they must ask for one). */
  | { ok: true; checkEmail: true; sent?: boolean }
  | { ok: false; error: string };

export type AuthMode = "login" | "signup";

/** Why a code was sent: confirming a new account, or resetting a password. */
export type CodePurpose = "signup" | "recovery";

export interface Credentials {
  email: string;
  password: string;
}

/** The hCaptcha token Supabase checks. Each one works once. */
type Captcha = { captchaToken?: string };

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

/** An action call returns `{ data, error }`; an error here means the request itself failed. */
const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/** Creates the account and emails a 6-digit code. */
export const signUp = async (input: Credentials & Captcha & { next?: string }) =>
  unwrap(await actions.auth.signUp(input)) as AuthResult;

/** Signs in with a password. Someone who never typed their code gets `checkEmail` with `sent: false`. */
export const logIn = async (input: Credentials & Captcha & { next?: string }) =>
  unwrap(await actions.auth.logIn(input)) as AuthResult;

/** Checks the 6-digit code. On success the person is signed in. */
export const verifyCode = async (input: { email: string; token: string; purpose: CodePurpose }) =>
  unwrap(await actions.auth.verifyCode(input)) as AuthResult;

/** Sends a new code. */
export const resendCode = async (input: Captcha & { email: string; purpose: CodePurpose }) =>
  unwrap(await actions.auth.resendCode(input)) as Simple;

/** Emails a reset code. The answer never says whether the email has an account. */
export const requestPasswordReset = async (input: Captcha & { email: string }) =>
  unwrap(await actions.auth.requestPasswordReset(input)) as Simple;

/** Sets a new password for the person the reset code signed in. */
export const updatePassword = async (input: { password: string }) =>
  unwrap(await actions.auth.updatePassword(input)) as AuthResult;

/** Ends the session and returns where to go. */
export const logOut = async () =>
  unwrap(await actions.auth.logOut()) as { ok: true; next: string } | typeof failed;

/** Google sign-in is designed but not connected yet; it needs a Google OAuth client. */
export const signInWithGoogle = async (_input: { mode: AuthMode; next?: string }): Promise<AuthResult> => ({
  ok: false,
  error: "Google sign-in is coming soon. Use your email for now.",
});
