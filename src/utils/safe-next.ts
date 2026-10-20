/** Only same-site paths are allowed, so a crafted `?next=` cannot send people to another site. */
export const safeNext = (next: string | null | undefined, fallback: string) =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
