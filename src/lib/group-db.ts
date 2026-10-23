import type { SupabaseClient } from "@supabase/supabase-js";
import { groupCategories } from "@/data/discover.ts";
import type { GroupCategoryId } from "@/data/discover.ts";
import type { GroupDetail, GroupMember, GroupPoll } from "@/data/group.ts";
import { interests } from "@/data/onboarding.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";

type PageJson = {
  group: {
    id: string;
    title: string;
    category: GroupCategoryId;
    tags: string[];
    purpose: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    minPeople: number;
    newcomer: boolean;
    status: string;
    starterPeople: number;
    hostLabel: string | null;
    isHost: boolean;
  };
  place: { name: string; address: string; town: string; kind: string; distKm: number | null };
  me: { handle: string; going: boolean | null; note: string };
  members: { handle: string; name: string; color: string | null; note: string; going: boolean | null; host: boolean }[];
  others: { total: number; going: number };
  poll: {
    id: string;
    question: string;
    options: { id: string; label: string; voters: string[]; mine: boolean }[];
  } | null;
};

const interestName = (id: string) => interests.find((item) => item.id === id)?.name ?? id.replace(/-/g, " ");
const MILES = 0.621371;

export const safeZone = (zone: string | undefined) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone || "UTC" });
    return zone || "UTC";
  } catch {
    return "UTC";
  }
};

const dayKey = (date: Date, zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** "Today, 7:30 PM", "Tomorrow, 9:00 AM" or "Sat, 4:00 PM", in the viewer's zone. */
export const whenLabel = (start: Date, zone: string, now: Date) => {
  const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(start);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const day =
    dayKey(start, zone) === dayKey(now, zone)
      ? "Today"
      : dayKey(start, zone) === dayKey(tomorrow, zone)
        ? "Tomorrow"
        : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone }).format(start);
  return `${day}, ${clock}`;
};

export const countdown = (start: Date, now: Date) => {
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "Happening now";
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
};

/**
 * One Discover group the signed-in person is in, in the shape the group page's store
 * expects. Null when they are not in it, so a link alone shows nothing.
 */
export const readGroupPage = async (
  supabase: SupabaseClient,
  groupId: string,
  zoneName: string | undefined,
): Promise<GroupDetail | null> => {
  const { data } = await supabase.rpc("group_page", { p_group: groupId });
  const json = data as PageJson | null;
  if (!json) return null;

  const zone = safeZone(zoneName);
  const now = new Date();
  const start = new Date(json.group.startsAt);
  const end = new Date(json.group.endsAt);
  const category = groupCategories.find((item) => item.id === json.group.category)!;
  const tags = json.group.tags.map(interestName);

  const members: GroupMember[] = json.members.map((member) => ({
    id: member.handle,
    name: member.name,
    color: nearestAccent(member.color),
    note: member.note || (member.host ? "Hosting" : ""),
    going: member.going === true,
  }));

  const poll: GroupPoll | undefined = json.poll
    ? {
        id: json.poll.id,
        question: json.poll.question,
        options: json.poll.options.map((option) => ({ id: option.id, label: option.label, voters: option.voters })),
        mine: json.poll.options.find((option) => option.mine)?.id ?? null,
      }
    : undefined;

  const miles = json.place.distKm === null ? null : Math.round(json.place.distKm * MILES * 10) / 10;
  const street = json.place.address || json.place.town;
  const hours = Math.max(1, Math.round((end.getTime() - start.getTime()) / 3_600_000));

  return {
    id: json.group.id,
    title: json.group.title,
    category: category.label,
    color: category.color,
    short: tags[0] ?? category.label,
    what: json.group.purpose || "Come say hello. Everyone here is new to someone.",
    tags: [...tags, ...(json.group.newcomer ? ["Beginner friendly"] : [])],
    place: json.place.name,
    address: `${street}${miles === null ? "" : ` · ${miles} mi away`}`,
    when: whenLabel(start, zone, now),
    countdown: countdown(start, now),
    lasts: `about ${hours} ${hours === 1 ? "hour" : "hours"}`,
    capacity: json.group.capacity,
    minimum: json.group.minPeople,
    members,
    poll,
    chat: [],
    going: json.me.going,
    onCalendar: false,
    isHost: json.group.isHost,
    counts: json.others,
    organizers: json.group.starterPeople
      ? { label: json.group.hostLabel ?? "the organizers", count: json.group.starterPeople }
      : undefined,
    calendarHref: `/app/groups/${json.group.id}/calendar.ics`,
  };
};
