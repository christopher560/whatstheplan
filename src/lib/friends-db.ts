import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_FRIEND_WEEK, dayNames } from "@/data/friends.ts";
import type { Friend, FriendRequest, FriendsData, FriendTone } from "@/data/friends.ts";
import type { CalendarFriend } from "@/data/calendar.ts";
import { isoDate, startOfWeek } from "@/lib/availability-db.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";

type Row = {
  other_id: string;
  first_name: string | null;
  avatar_color: string | null;
  username: string | null;
  status: "pending" | "accepted";
  since: string;
  shared: boolean;
  favorite: boolean;
  tags: string[];
  circle_position: number | null;
};

type FreeWeek = { friend_id: string; week_offset: number; keys: string[] };

/** "6 PM" for hour 18. */
const clock = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

const part = (hour: number) => (hour >= 17 ? "evening" : hour >= 12 ? "afternoon" : "morning");

const hoursOf = (keys: string[], day: number) =>
  keys.filter((key) => key.startsWith(`${day}-`)).map((key) => Number(key.split("-")[1]));

/** How free a friend is tonight and when they are next free, from the hours they share. */
const mood = (weeks: string[][], shared: boolean, today: number, nowHour: number) => {
  if (!shared) {
    return { tone: "away" as FriendTone, status: "Calendar private", nextFree: "Calendar not shared." };
  }
  const tonight = hoursOf(weeks[0] ?? [], today).filter((hour) => hour >= Math.max(17, nowHour));
  if (tonight.length >= 3) {
    return {
      tone: "free" as FriendTone,
      status: `Free after ${clock(tonight[0])}`,
      nextFree: `Free tonight after ${clock(tonight[0])}.`,
    };
  }
  if (tonight.length > 0) {
    return {
      tone: "maybe" as FriendTone,
      status: "Maybe tonight",
      nextFree: `Maybe after ${clock(tonight[0])} tonight.`,
    };
  }
  for (let week = 0; week <= MAX_FRIEND_WEEK; week++) {
    for (let day = week === 0 ? today + 1 : 0; day < 7; day++) {
      const hours = hoursOf(weeks[week] ?? [], day);
      if (hours.length) {
        const when = week === 0 ? dayNames[day] : `${dayNames[day]} next week`;
        return {
          tone: "busy" as FriendTone,
          status: "Busy tonight",
          nextFree: `Next free: ${when} ${part(hours[0])}.`,
        };
      }
    }
  }
  return { tone: "busy" as FriendTone, status: "Busy tonight", nextFree: "No free time shared yet." };
};

/** Friend requests other people sent that the signed-in person has not answered, for the sidebar badge. */
export const countFriendRequests = async (supabase: SupabaseClient, userId: string) => {
  const { count } = await supabase
    .from("friendships")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("addressee_id", userId);
  return count ?? 0;
};

/** The signed-in person's friends, with the hours each shares, ready for the pages. */
export const loadPeople = async (supabase: SupabaseClient, now: Date) => {
  const monday = startOfWeek(now);
  const [list, free] = await Promise.all([
    supabase.rpc("list_friends"),
    supabase.rpc("friend_free_slots", { p_monday: isoDate(monday) }),
  ]);

  const byFriend = new Map<string, string[][]>();
  ((free.data ?? []) as FreeWeek[]).forEach((row) => {
    const weeks = byFriend.get(row.friend_id) ?? Array.from({ length: MAX_FRIEND_WEEK + 1 }, () => [] as string[]);
    weeks[row.week_offset] = row.keys;
    byFriend.set(row.friend_id, weeks);
  });

  return { rows: (list.data ?? []) as Row[], byFriend, monday };
};

/** Everything the friends page shows. */
export const readFriends = async (
  supabase: SupabaseClient,
  userId: string,
  now: Date,
  host: string,
): Promise<FriendsData> => {
  const [{ rows, byFriend, monday }, me, username] = await Promise.all([
    loadPeople(supabase, now),
    supabase.from("profiles").select("first_name, avatar_color").eq("id", userId).maybeSingle(),
    supabase.rpc("ensure_my_username"),
  ]);

  const today = (now.getDay() + 6) % 7;
  const nowHour = now.getHours();

  const build = (row: Row): Friend => {
    const weeks = byFriend.get(row.other_id) ?? [];
    const keys = Array.from({ length: MAX_FRIEND_WEEK + 1 }, (_, week) => weeks[week] ?? []);
    const since = new Date(row.since);
    return {
      id: row.other_id,
      name: row.first_name || `@${row.username ?? "friend"}`,
      color: nearestAccent(row.avatar_color),
      ...mood(keys, row.shared, today, nowHour),
      shared: `Friends since ${since.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      weeks: keys.map((week) => dayNames.map((_, day) => (hoursOf(week, day).length ? 1 : 0))),
      tags: row.tags,
    };
  };

  const accepted = rows.filter((row) => row.status === "accepted");
  const requests: FriendRequest[] = rows
    .filter((row) => row.status === "pending")
    .map((row) => ({ ...build(row), shared: "New friend", note: `@${row.username} wants to be friends` }));

  return {
    friends: accepted.map(build),
    requests,
    circle: accepted
      .filter((row) => row.circle_position !== null)
      .sort((a, b) => a.circle_position! - b.circle_position!)
      .map((row) => row.other_id),
    favorites: accepted.filter((row) => row.favorite).map((row) => row.other_id),
    weekStart: isoDate(monday),
    todayIndex: today,
    viewer: {
      initial: (me.data?.first_name ?? "?").charAt(0).toUpperCase(),
      color: nearestAccent(me.data?.avatar_color),
    },
    addLink: username.data ? `${host}/add/${username.data}` : "",
  };
};

/** Accepted friends in the shape the calendar overlay uses: the hours they share, week by week. */
export const readCalendarFriends = async (
  supabase: SupabaseClient,
  now: Date,
): Promise<CalendarFriend[]> => {
  const { rows, byFriend } = await loadPeople(supabase, now);
  return rows
    .filter((row) => row.status === "accepted" && row.shared)
    .map((row) => ({
      id: row.other_id,
      name: row.first_name || `@${row.username ?? "friend"}`,
      color: nearestAccent(row.avatar_color),
      freeByWeek: Array.from({ length: MAX_FRIEND_WEEK + 1 }, (_, week) => byFriend.get(row.other_id)?.[week] ?? []),
    }));
};
