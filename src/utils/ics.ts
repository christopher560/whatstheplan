/** Text values in a calendar file escape backslashes, commas, semicolons and line breaks. */
const escape = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  place?: string;
  description?: string;
  tentative?: boolean;
}

/** One event as a calendar (.ics) file, with the line endings calendars expect. */
export const icsFile = (event: IcsEvent) => {
  const description = [event.tentative ? "Time not locked in yet." : "", event.description ?? ""].filter(Boolean).join(" ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//whatstheplan//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.uid}@whatstheplan.social`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    ...(event.tentative ? ["STATUS:TENTATIVE"] : []),
    ...(event.place ? [`LOCATION:${escape(event.place)}`] : []),
    ...(description ? [`DESCRIPTION:${escape(description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
};

export const icsResponse = (body: string, filename: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
