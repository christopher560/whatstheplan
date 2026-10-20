/**
 * What the sign-up and log-in pages send and get back. Backed by a stand-in
 * today, so any email and password gets through. The Supabase version calls
 * `auth.signUp`, `auth.signInWithPassword`, `auth.resetPasswordForEmail` and
 * `auth.signInWithOAuth` from Astro Actions, sets the session cookie on the
 * server, and returns where to go next (see SUPABASE.md).
 */
export type AuthResult =
  /** Signed in. `next` is the page to open. */
  | { ok: true; next: string }
  /** An email was sent. The person finishes by opening the link in it. */
  | { ok: true; checkEmail: true }
  | { ok: false; error: string };

export type AuthMode = "login" | "signup";

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthRepo {
  /** Creates the account. New people go to onboarding next. */
  signUp(input: Credentials & { next?: string }): Promise<AuthResult>;
  /** Signs in with a password. People who finished onboarding go to the app. */
  logIn(input: Credentials & { next?: string }): Promise<AuthResult>;
  /** Emails a reset link. The answer never says whether the email has an account. */
  requestPasswordReset(input: { email: string }): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Continues with Google, for both sign up and log in. */
  signInWithGoogle(input: { mode: AuthMode; next?: string }): Promise<AuthResult>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Only same-site paths are allowed, so a crafted `?next=` cannot send people away. */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;

const landing = (mode: AuthMode, next?: string) =>
  safeNext(next, mode === "signup" ? "/app/onboarding" : "/app/dashboard");

const mockRepo: AuthRepo = {
  async signUp({ next }) {
    await wait(900);
    return { ok: true, next: landing("signup", next) };
  },
  async logIn({ next }) {
    await wait(900);
    return { ok: true, next: landing("login", next) };
  },
  async requestPasswordReset() {
    await wait(600);
    return { ok: true };
  },
  async signInWithGoogle({ mode, next }) {
    await wait(700);
    return { ok: true, next: landing(mode, next) };
  },
};

export const authRepo: AuthRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const signUp = (input: Credentials & { next?: string }) => authRepo.signUp(input);
export const logIn = (input: Credentials & { next?: string }) => authRepo.logIn(input);
export const requestPasswordReset = (input: { email: string }) =>
  authRepo.requestPasswordReset(input);
export const signInWithGoogle = (input: { mode: AuthMode; next?: string }) =>
  authRepo.signInWithGoogle(input);
