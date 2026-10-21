import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_WEEK_OFFSET } from "@/data/calendar.ts";
import type { CalendarData, Cell } from "@/data/calendar.ts";

/** Day and hour of one painted hour, in the keys the calendar uses: `weekday-hour`. */
const key = (row: { weekday: number; hour: number }) => `${row.weekday}-${row.hour}`;

const pad = (value: number) => String(value).padStart(2, "0");

/** A date as `YYYY-MM-DD`, in the date's own local fields. */
export const isoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const startOfWeek = (date: Date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
};

export const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

type Row = { week_start: string; weekday: number; hour: number; state: Cell };

const toCells = (rows: Row[]) => Object.fromEntries(rows.map((row) => [key(row), row.state]));

/** How many whole weeks `start` is after `weekStart`. */
const weeksBetween = (weekStart: string, start: string) =>
  Math.round((new Date(`${start}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime()) / 604_800_000);

/**
 * The signed-in person's calendar. A week they saved comes back as saved, even
 * when every hour was cleared (`availability_weeks` remembers it). A week they
 * never saved starts from the most recent saved week up to this one (`cells`), so
 * a habit carries forward without a separate weekly pattern.
 *
 * Friends and plans are empty until those tables exist.
 */
export const readCalendar = async (
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<CalendarData> => {
  const monday = startOfWeek(now);
  const weekStart = isoDate(monday);
  const lastWeek = isoDate(addDays(monday, 7 * MAX_WEEK_OFFSET));

  const [saved, ahead, latest, profile] = await Promise.all([
    supabase
      .from("availability_weeks")
      .select("week_start")
      .eq("user_id", userId)
      .gte("week_start", weekStart)
      .lte("week_start", lastWeek),
    supabase
      .from("availability_cells")
      .select("week_start, weekday, hour, state")
      .eq("user_id", userId)
      .gte("week_start", weekStart)
      .lte("week_start", lastWeek),
    supabase
      .from("availability_weeks")
      .select("week_start")
      .eq("user_id", userId)
      .lte("week_start", weekStart)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("calendar_shared").eq("id", userId).maybeSingle(),
  ]);

  /* Saved weeks from this one on, by how many weeks ahead. A saved week with no rows is empty on purpose. */
  const weeks: Record<number, Record<string, Cell>> = {};
  (saved.data ?? []).forEach((row) => {
    weeks[weeksBetween(weekStart, row.week_start)] = {};
  });
  const byWeek = new Map<string, Row[]>();
  ((ahead.data ?? []) as Row[]).forEach((row) => {
    byWeek.set(row.week_start, [...(byWeek.get(row.week_start) ?? []), row]);
  });
  byWeek.forEach((rows, start) => {
    weeks[weeksBetween(weekStart, start)] = toCells(rows);
  });

  /* The base for weeks nobody saved: the latest saved week up to this one. */
  let base: Record<string, Cell> = weeks[0] ?? {};
  if (!saved.data?.some((row) => row.week_start === weekStart) && latest.data?.week_start) {
    const { data } = await supabase
      .from("availability_cells")
      .select("week_start, weekday, hour, state")
      .eq("user_id", userId)
      .eq("week_start", latest.data.week_start);
    base = toCells((data ?? []) as Row[]);
  }

  return {
    weekStart,
    today: isoDate(now),
    cells: base,
    weeks,
    friends: [],
    who: [],
    share: profile.data?.calendar_shared ?? true,
    plans: [],
  };
};
