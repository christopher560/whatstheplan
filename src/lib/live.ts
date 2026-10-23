/**
 * Live updates by cheap, patient checking. The browser cannot read the sign-in cookie (a security
 * choice), so it cannot hold a push connection to the database. Instead an open page asks a tiny
 * question ("has anything changed?") and only fetches the full data when the answer changes.
 * It also slows down while nothing happens and stops when nobody is using the page.
 */

type Poll<T> = {
  /**
   * A short fingerprint of what the page shows. When it changes, `load` runs. Leave it out for tiny
   * data (like two numbers), and `load` runs on every check instead, acting only if the data differs.
   */
  pulse?: () => Promise<string | null>;
  /** Fetches the latest data, or null if there is nothing to show (signed out, gone, closed). */
  load: () => Promise<T | null>;
  /** Called with new data. */
  apply: (data: T) => void;
  /** The fastest check, in milliseconds. It slows to 2x after about a minute of quiet and 3x after two. */
  interval?: number;
};

/** After this long with no touch, scroll or key press, checking pauses until the person comes back. */
const IDLE_PAUSE = 15 * 60_000;

let lastTouch = Date.now();
const wake = new Set<() => void>();
if (typeof window !== "undefined") {
  ["pointerdown", "keydown", "input", "touchstart", "scroll"].forEach((name) =>
    window.addEventListener(
      name,
      () => {
        const wasIdle = Date.now() - lastTouch > IDLE_PAUSE;
        lastTouch = Date.now();
        if (wasIdle) wake.forEach((resume) => resume());
      },
      { passive: true },
    ),
  );
}

export const poll = <T>({ pulse, load, apply, interval = 10_000 }: Poll<T>) => {
  let lastPulse: string | null = null;
  let lastData = "";
  let quiet = 0;
  let errors = 0;
  let timer = 0;
  let running = false;

  /** Gets slower the longer nothing has changed, and slower again after errors. */
  const delay = () =>
    Math.min(interval * (quiet < 6 ? 1 : quiet < 12 ? 2 : 3) * 2 ** Math.min(errors, 3), 60_000);

  const schedule = () => {
    window.clearTimeout(timer);
    if (Date.now() - lastTouch > IDLE_PAUSE) return;
    timer = window.setTimeout(tick, delay());
  };

  const refresh = async () => {
    const data = await load();
    if (data === null) return false;
    apply(data);
    return true;
  };

  const tick = async () => {
    if (document.visibilityState !== "visible") return schedule();
    if (running) return;
    running = true;
    try {
      let changed = false;
      if (pulse) {
        const now = await pulse();
        if (now !== null) {
          if (lastPulse !== null && now !== lastPulse) changed = await refresh();
          lastPulse = now;
        }
      } else {
        const data = await load();
        if (data !== null) {
          const key = JSON.stringify(data);
          if (lastData && key !== lastData) {
            apply(data);
            changed = true;
          }
          lastData = key;
        }
      }
      quiet = changed ? 0 : quiet + 1;
      errors = 0;
    } catch {
      errors += 1;
    }
    running = false;
    schedule();
  };

  /** Coming back to the tab, or touching the page after a quiet spell, checks at once and speeds up again. */
  const resume = () => {
    quiet = 0;
    window.clearTimeout(timer);
    void tick();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
  wake.add(resume);
  void tick();
};

let reloading = false;

/** True while someone is typing something, or just touched the page. */
const busy = () =>
  Date.now() - lastTouch < 4000 ||
  [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")].some(
    (field) =>
      field.offsetParent !== null &&
      !["checkbox", "radio", "button", "submit", "hidden"].includes((field as HTMLInputElement).type) &&
      field.value.trim() !== "",
  );

/**
 * Refreshes the page to show something new that the page cannot draw in place (a new person, a new
 * invite). It waits until the person has stopped typing, so nothing they wrote is lost.
 */
export const reloadWhenIdle = () => {
  if (reloading) return;
  reloading = true;
  const check = () => {
    if (busy()) return void window.setTimeout(check, 2000);
    location.reload();
  };
  check();
};
