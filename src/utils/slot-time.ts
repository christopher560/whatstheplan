/**
 * How a proposed time reads. Times are stored as instants and shown in the plan's
 * own time zone (the host's), so every guest sees the same wall-clock time.
 */
const safeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
};

/** "Fri, Oct 23" */
export const slotDay = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: safeZone(zone) }).format(
    new Date(iso),
  );

/** "7:00 PM" */
export const slotClock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: safeZone(zone) }).format(new Date(iso));

/** "Fri, Oct 23 · 7:00 PM" */
export const slotLabel = (iso: string, zone: string) => `${slotDay(iso, zone)} · ${slotClock(iso, zone)}`;
