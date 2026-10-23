import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccentColor } from "@/types.ts";
import { interests } from "@/data/onboarding.ts";
import type { DiscoverData, DiscoverDay, DiscoverMember, GroupCategoryId, HostPlace, OpenGroup } from "@/data/discover.ts";
import { readCalendar } from "@/lib/availability-db.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";

type Person = { name: string; color: string | null; host: boolean; shared: string[] };

type GroupJson = {
  id: string;
  title: string;
  category: GroupCategoryId;
  tags: string[];
  purpose: string;
  startsAt: string;
  endsAt: string;
  place: string;
  town: string;
  distKm: number;
  capacity: number;
  starterPeople: number;
  hostLabel: string | null;
  hasHost: boolean;
  newcomer: boolean;
  joined: boolean;
  score: number;
  them: number;
  sharedIds: string[];
  crowdN: number;
  otherN: number;
  friendsN: number;
  fofN: number;
  nearly: boolean;
  people: Person[];
};

type MatchesJson =
  | { status: "closed" }
  | { status: "needs_location" }
  | {
      status: "ok";
      minScore: number;
      label: string | null;
      radiusKm: number;
      groups: GroupJson[];
      places: { id: string; name: string; kind: string; town: string; distKm: number }[];
    };

export type DiscoverResult =
  | { status: "closed" | "needs_location" }
  | { status: "ok"; data: DiscoverData };

const interestName = (id: string) => interests.find((item) => item.id === id)?.name ?? id.replace(/-/g, " ");

const MILES = 0.621371;

const safeZone = (zone: string | undefined) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone || "UTC" });
    return zone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Date and 24-hour clock of an instant in someone's zone. */
const clockIn = (date: Date, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    date: `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`,
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") + get("minute") / 60,
  };
};

const timeLabel = (hour: number) => {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return `${whole % 12 === 0 ? 12 : whole % 12}:${String(minutes).padStart(2, "0")} ${whole >= 12 ? "PM" : "AM"}`;
};

/** Merges busy hours into [from, to) blocks. */
const blocks = (hours: number[]): [number, number][] => {
  const sorted = [...hours].sort((a, b) => a - b);
  const out: [number, number][] = [];
  sorted.forEach((hour) => {
    const last = out[out.length - 1];
    if (last && last[1] === hour) last[1] = hour + 1;
    else out.push([hour, hour + 1]);
  });
  return out;
};

/**
 * What the Discover page shows for the signed-in person: the groups that passed the
 * database's filters, already scored, in the shape the page's store expects.
 */
export const readDiscover = async (
  supabase: SupabaseClient,
  userId: string,
  zoneName: string | undefined,
  wallClock: Date,
): Promise<DiscoverResult> => {
  const zone = safeZone(zoneName);
  const [matches, profile, calendar] = await Promise.all([
    supabase.rpc("discover_matches"),
    supabase.from("profiles").select("first_name, avatar_color, interests").eq("id", userId).maybeSingle(),
    readCalendar(supabase, userId, wallClock),
  ]);
  const json = matches.data as MatchesJson | null;
  if (!json || matches.error) return { status: "closed" };
  if (json.status !== "ok") return { status: json.status };

  const now = new Date();
  const today = clockIn(now, zone);

  /* The next seven days, as the page's week strip: today first. */
  const base = Date.UTC(today.year, today.month - 1, today.day);
  const days: DiscoverDay[] = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(base + index * 86_400_000);
    return {
      name: index === 0 ? "Today" : at.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      num: at.getUTCDate(),
      weekday: at.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    };
  });
  const dayDates = Array.from({ length: 7 }, (_, index) => new Date(base + index * 86_400_000).toISOString().slice(0, 10));

  /* The viewer's busy hours for those days, from the calendar. */
  const monday = new Date(`${calendar.weekStart}T00:00:00Z`).getTime();
  const busy = dayDates.map((date) => {
    const at = new Date(`${date}T00:00:00Z`);
    const weekday = (at.getUTCDay() + 6) % 7;
    const offset = Math.floor((at.getTime() - monday) / (7 * 86_400_000));
    const cells = calendar.weeks[offset] ?? calendar.cells;
    const hours = Object.entries(cells)
      .filter(([key, value]) => value === "busy" && key.startsWith(`${weekday}-`))
      .map(([key]) => Number(key.split("-")[1]));
    return blocks(hours);
  });

  const members: DiscoverMember[] = [];
  const groups: OpenGroup[] = [];
  const viewerColor = nearestAccent(profile.data?.avatar_color);
  let counter = 0;

  json.groups.forEach((group) => {
    const start = clockIn(new Date(group.startsAt), zone);
    const end = clockIn(new Date(group.endsAt), zone);
    const day = dayDates.indexOf(start.date);
    if (day < 0) return;

    const ids: string[] = [];
    let hostId = "";
    const add = (person: DiscoverMember, host: boolean) => {
      members.push(person);
      ids.push(person.id);
      if (host && !hostId) hostId = person.id;
    };
    group.people.forEach((person) =>
      add(
        {
          id: `m${++counter}`,
          name: person.name,
          color: nearestAccent(person.color),
          /* Only interests shared with the viewer are sent, never the rest of a stranger's profile. */
          likes: person.shared.map(interestName),
        },
        person.host,
      ),
    );
    for (let i = 0; i < group.starterPeople; i++) {
      add({ id: `m${++counter}`, name: group.hostLabel?.split(" ")[0] ?? "Crew", color: "orange" as AccentColor, likes: [] }, !group.hasHost);
    }
    if (!hostId) {
      /* Only the viewer is in it, so they are the host. */
      members.push({ id: `m${++counter}`, name: "You", color: viewerColor, likes: [] });
      hostId = `m${counter}`;
    }

    groups.push({
      id: group.id,
      title: group.title,
      category: group.category,
      tags: group.tags.map(interestName),
      purpose: group.purpose,
      day,
      start: start.hour,
      end: end.date === start.date ? end.hour : 24 + end.hour,
      place: group.place,
      distance: Math.round(group.distKm * MILES * 10) / 10,
      capacity: group.capacity,
      memberIds: ids,
      hostId,
      newcomerFriendly: group.newcomer,
      joined: group.joined,
      fit: {
        you: group.score,
        them: group.them,
        mutual: group.score,
        sharedTags: group.sharedIds.map(interestName),
        overlap: group.crowdN,
        friends: group.friendsN,
        nearly: group.nearly,
      },
    });
  });

  const places: HostPlace[] = json.places.map((place) => ({
    id: place.id,
    name: place.name,
    kind: place.kind,
    town: place.town,
    miles: Math.round(place.distKm * MILES * 10) / 10,
  }));

  const weekday = days[0].weekday;
  return {
    status: "ok",
    data: {
      area: json.label ?? "you",
      minScore: json.minScore,
      joined: groups.filter((group) => group.joined).map((group) => group.id),
      places,
      clock: { weekday, time: timeLabel(today.hour), hour: today.hour },
      viewer: {
        initial: (profile.data?.first_name ?? "?").charAt(0).toUpperCase(),
        color: viewerColor,
        interests: ((profile.data?.interests ?? []) as string[]).map(interestName),
      },
      days,
      busy,
      members,
      groups,
    },
  };
};
