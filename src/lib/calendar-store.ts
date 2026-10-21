import { DAYS, HOURS, MAX_WEEK_OFFSET, weekDatesFor } from "@/data/calendar.ts";
import type { CalendarData, CalendarFriend, CalendarPlan, Cell } from "@/data/calendar.ts";
import { saveAvailability, saveShare } from "@/lib/calendar-repo.ts";

/**
 * Shared state for the calendar page. Each component script subscribes to the
 * parts it draws. Initial data comes from the JSON `CalendarState` renders, and
 * changes are saved through `calendar-repo`.
 */
export type Brush = Cell | "erase";

export interface CalendarState {
  /** The availability of the week being shown, keyed `weekday-hour`. */
  cells: Record<string, Cell>;
  /** Availability of the other weeks that were opened, by week offset. */
  weeks: Record<number, Record<string, Cell>>;
  who: string[];
  brush: Brush;
  repeat: number[];
  share: boolean;
  weekOffset: number;
  /** Plan picked on the grid or in the list. */
  selPlan: string | null;
  /** Bumps when the friend picks change, to replay the swap animation. */
  tick: number;
}

let data: CalendarData | null = null;
let state: CalendarState;
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

export const getData = (): CalendarData => {
  if (!data) {
    const source = document.getElementById("calendar-data")?.textContent ?? "{}";
    data = JSON.parse(source) as CalendarData;
    state = {
      cells: data.weeks[0] ?? data.cells,
      weeks: { ...data.weeks },
      who: data.who,
      brush: "free",
      repeat: [],
      share: data.share,
      weekOffset: 0,
      selPlan: null,
      tick: 0,
    };
  }
  return data;
};

export const get = () => {
  getData();
  return state;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parse = (value: string) => new Date(`${value}T12:00:00`);

/** The seven dates of the week being shown. */
export const weekDates = () => weekDatesFor(getData().weekStart, get().weekOffset);

export const update = (patch: Partial<CalendarState>) => {
  getData();
  const before = state;
  state = { ...state, ...patch };
  if (patch.cells && patch.cells !== before.cells) {
    window.clearTimeout(saveTimer);
    const weekStart = iso(weekDates()[0]);
    const cells = state.cells;
    saveTimer = window.setTimeout(() => void saveAvailability(weekStart, cells), 600);
  }
  if (patch.share !== undefined && patch.share !== before.share) {
    void saveShare(state.share);
  }
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getData();
  listeners.add(listener);
  listener();
};

/** Opens another week. A week nobody painted yet starts from the weekly pattern. */
export const setWeek = (offset: number) => {
  const next = Math.min(MAX_WEEK_OFFSET, Math.max(0, offset));
  const before = get();
  if (next === before.weekOffset) return;
  state = {
    ...before,
    weeks: { ...before.weeks, [before.weekOffset]: before.cells },
    cells: before.weeks[next] ?? { ...getData().cells },
    weekOffset: next,
    selPlan: null,
  };
  listeners.forEach((listener) => listener());
};

export const selectedFriends = (): CalendarFriend[] =>
  getData().friends.filter((friend) => get().who.includes(friend.id));

/* ---------- plans ---------- */

export type WeekPlan = CalendarPlan & { day: number };

/** Plans that fall in the week being shown, with their weekday index. */
export const weekPlans = (): WeekPlan[] => {
  const dates = weekDates().map(iso);
  return getData().plans.flatMap((plan) => {
    const day = dates.indexOf(plan.date);
    return day < 0 ? [] : [{ ...plan, day }];
  });
};

export const planAt = (day: number, hour: number) =>
  weekPlans().find((plan) => plan.day === day && hour >= plan.from && hour < plan.to);

export const selectedPlan = () => weekPlans().find((plan) => plan.id === get().selPlan);

/* ---------- cells ---------- */

/** Hours painted free and busy. Plans that are confirmed count as busy. */
export const totals = () => {
  const plans = weekPlans();
  const covered = (key: string) => {
    const [day, hour] = key.split("-").map(Number);
    return plans.some((plan) => plan.day === day && hour >= plan.from && hour < plan.to);
  };
  const entries = Object.entries(get().cells).filter(([key]) => !covered(key));
  const planHours = plans
    .filter((plan) => plan.kind !== "pending")
    .reduce((sum, plan) => sum + plan.to - plan.from, 0);
  return {
    free: entries.filter(([, value]) => value === "free").length,
    busy: entries.filter(([, value]) => value === "busy").length + planHours,
  };
};

export const monthDay = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const isToday = (date: Date) =>
  date.toDateString() === parse(getData().today).toDateString();

export const weekLabel = () => {
  const dates = weekDates();
  const first = dates[0];
  const last = dates[6];
  const sameMonth = first.getMonth() === last.getMonth();
  return sameMonth
    ? `${monthDay(first)} to ${last.getDate()}`
    : `${monthDay(first)} to ${monthDay(last)}`;
};

export const hourLabel = (hour: number) => {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
};

export const friendIsFree = (friend: CalendarFriend, day: number, hour: number) =>
  friend.freeByWeek[get().weekOffset]?.includes(`${day}-${hour}`) ?? false;

export interface CellView {
  state: "none" | "free" | "busy" | "plan" | "pending";
  /** How many picked friends share this free hour. */
  match: "" | "all" | "some" | "none";
  free: number;
  total: number;
  plan?: WeekPlan;
  label: string;
}

/** What one hour looks like to the grid and the strips. */
export const describeCell = (day: number, hour: number): CellView => {
  const friends = selectedFriends();
  const plan = planAt(day, hour);
  const value = get().cells[`${day}-${hour}`];
  const free = friends.filter((friend) => friendIsFree(friend, day, hour)).length;
  const total = friends.length;
  const name = `${DAYS[day]} ${hourLabel(hour)}`;

  if (plan) {
    return {
      state: plan.kind === "pending" ? "pending" : "plan",
      match: "",
      free,
      total,
      plan,
      label: `${name}: plan, ${plan.title}`,
    };
  }
  if (value === "busy") {
    return { state: "busy", match: "", free, total, label: `${name}: busy` };
  }
  if (value === "free") {
    if (total === 0) return { state: "free", match: "", free, total, label: `${name}: free` };
    const match = free === total ? "all" : free > 0 ? "some" : "none";
    const text =
      match === "all"
        ? "free, all friends free"
        : match === "some"
          ? `free, ${free} of ${total} friends free`
          : "free, no friends free";
    return { state: "free", match, free, total, label: `${name}: ${text}` };
  }
  return { state: "none", match: "", free, total, label: `${name}: not set` };
};

export interface FreeRun {
  day: number;
  start: number;
  end: number;
  length: number;
  score: number;
}

/** Every stretch of two or more hours when you and every picked friend are free, best first. */
export const freeRuns = (): FreeRun[] => {
  const friends = selectedFriends();
  if (friends.length === 0) return [];
  const { cells } = get();
  const runs: FreeRun[] = [];
  DAYS.forEach((_, day) => {
    let start: number | null = null;
    for (let hour = HOURS[0]; hour <= 24; hour++) {
      const plan = hour < 24 ? planAt(day, hour) : undefined;
      const ok =
        hour < 24 &&
        !(plan && plan.kind !== "pending") &&
        cells[`${day}-${hour}`] === "free" &&
        friends.every((friend) => friendIsFree(friend, day, hour));
      if (ok && start === null) start = hour;
      if (!ok && start !== null) {
        const length = hour - start;
        if (length >= 2) {
          runs.push({
            day,
            start,
            end: hour,
            length,
            score: length + (day >= 5 ? 2 : 0) + (start >= 17 ? 1 : 0),
          });
        }
        start = null;
      }
    }
  });
  return runs.sort((a, b) => b.score - a.score);
};

/** The three best stretches. */
export const bestTimes = () => freeRuns().slice(0, 3);
