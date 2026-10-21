import { PUBLIC_HCAPTCHA_SITE_KEY } from "astro:env/client";

/**
 * hCaptcha for the auth forms. Supabase checks a token on every sign in, sign
 * up, reset and resend, so each form that makes one of those requests shows a
 * box. A token works once, so the box is reset after every request.
 */
interface HCaptchaApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      size?: "normal" | "compact";
      callback?: () => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  getResponse(id: string): string;
  reset(id: string): void;
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi;
  }
}

/** Without a site key there is no box, and Supabase rejects requests if its CAPTCHA is on. */
export const captchaEnabled = Boolean(PUBLIC_HCAPTCHA_SITE_KEY);

let loading: Promise<void> | null = null;

/* hCaptcha asks for its own `onload` callback: the script can finish before the API is ready to draw. */
const load = () =>
  (loading ??= new Promise<void>((resolve, reject) => {
    (window as unknown as Record<string, () => void>).hcaptchaReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://js.hcaptcha.com/1/api.js?render=explicit&onload=hcaptchaReady";
    script.async = true;
    script.onerror = () => reject(new Error("hCaptcha did not load"));
    document.head.append(script);
  }));

export interface Captcha {
  /** The current token, or an empty string until the box is ticked. */
  token(): string;
  /** Clears the box so it can be used again. */
  reset(): void;
}

/** Draws the box in `container`. `onChange` runs when it is ticked, expires or fails. */
export const mountCaptcha = async (container: HTMLElement, onChange: () => void): Promise<Captcha> => {
  await load();
  const id = window.hcaptcha!.render(container, {
    sitekey: PUBLIC_HCAPTCHA_SITE_KEY!,
    size: container.clientWidth > 0 && container.clientWidth < 310 ? "compact" : "normal",
    callback: onChange,
    "expired-callback": onChange,
    "error-callback": onChange,
  });
  return {
    token: () => window.hcaptcha!.getResponse(id),
    reset: () => {
      window.hcaptcha!.reset(id);
      onChange();
    },
  };
};
