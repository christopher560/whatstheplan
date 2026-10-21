import type { AstroCookies } from "astro";

/**
 * "Now" on the person's own clock. The browser sets a `tz` cookie (see the
 * dashboard layout), and the server works out this week, tonight and today from
 * it. Without the cookie it falls back to UTC. The returned date's local fields
 * (`getDay`, `getHours`) read as the person's wall clock.
 */
export const nowFor = (cookies: AstroCookies): Date => {
  const zone = cookies.get("tz")?.value;
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: zone || "UTC" }));
  } catch {
    return new Date();
  }
};
