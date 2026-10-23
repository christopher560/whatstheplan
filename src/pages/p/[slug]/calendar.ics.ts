import type { APIRoute } from "astro";

/* The locked time of a plan as a calendar file, for the invite page's "Add to calendar". */
export const prerender = false;

type Json = {
  plan: { title: string; description: string; place: string; slug: string; locked: string | null };
  slots: { id: string; at: string; pos: number }[];
};

/** Text values in a calendar file escape backslashes, commas, semicolons and line breaks. */
const escape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = params.slug ?? "";
  if (!/^[a-z0-9-]{8,80}$/.test(slug)) return new Response("Not found", { status: 404 });

  const { data } = await locals.supabase.rpc("public_invite", { p_slug: slug });
  const json = data as Json | null;
  const slot = json?.slots.find((item) => item.id === json.plan.locked) ?? json?.slots.find((item) => item.pos === 0) ?? json?.slots[0];
  if (!json || !slot) return new Response("No time has been picked yet.", { status: 404 });
  const tentative = json.plan.locked !== slot.id;

  const start = new Date(slot.at);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//whatstheplan//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${slot.id}@whatstheplan.social`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(json.plan.title)}`,
    ...(tentative ? ["STATUS:TENTATIVE"] : []),
    ...(json.plan.place ? [`LOCATION:${escape(json.plan.place)}`] : []),
    ...(json.plan.description || tentative
      ? [`DESCRIPTION:${escape([tentative ? "Time not locked in yet." : "", json.plan.description].filter(Boolean).join(" "))}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(`${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
};
