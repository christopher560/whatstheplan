import { actions } from "astro:actions";
import type { Cell } from "@/data/calendar.ts";

type Simple = { ok: true } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

/** An action call returns `{ data, error }`; an error here means the request itself failed. */
const unwrap = <T>({ data, error }: { data?: T; error?: unknown }): T | typeof failed =>
  error || data === undefined ? failed : data;

/**
 * What the calendar page writes. The page reads the calendar on the server with
 * `readCalendar` (src/lib/availability-db.ts); these calls go to Astro Actions
 * (src/actions/index.ts), which check the rules again and write
 * `availability_cells` and `profiles.calendar_shared`.
 */

/** Replaces the person's availability for the week starting `weekStart`. */
export const saveAvailability = async (weekStart: string, cells: Record<string, Cell>) =>
  unwrap(await actions.calendar.saveAvailability({ weekStart, cells })) as Simple;

/** Turns calendar sharing with friends on or off. */
export const saveShare = async (share: boolean) =>
  unwrap(await actions.calendar.saveShare({ share })) as Simple;
