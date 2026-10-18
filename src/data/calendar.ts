import type { AccentColor } from "@/types.ts";

export type Cell = "free" | "busy";

/** Monday first, matching the `weekday` column (0 to 6). */
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Hours shown in the grid, 8 AM to 11 PM. */
export const HOURS = Array.from({ length: 16 }, (_, index) => index + 8);

/** How many weeks ahead can be opened (this week plus seven). */
export const MAX_WEEK_OFFSET = 7;

export interface CalendarFriend {
  id: string;
  name: string;
  color: AccentColor;
  /**
   * Slots this friend is free, as `weekday-hour` keys such as `2-19`. One list
   * per week, index 0 being the week in `weekStart`.
   */
  freeByWeek: string[][];
}

/** How the viewer is involved in a plan on the calendar. */
export type PlanKind = "host" | "going" | "group" | "pending";

export interface CalendarPlan {
  /** Primary key of the `plans` row. */
  id: string;
  /** Day of the plan, as `YYYY-MM-DD`. */
  date: string;
  /** First hour on the grid, and the hour after the last one. */
  from: number;
  to: number;
  /** Short name that fits one grid cell. */
  short: string;
  title: string;
  when: string;
  place: string;
  kind: PlanKind;
}

export const planKinds: Record<
  PlanKind,
  { label: string; tag: string; color: AccentColor | "white"; cta: string }
> = {
  host: { label: "You're hosting", tag: "Host", color: "yellow", cta: "See who replied" },
  going: { label: "You're going", tag: "Going", color: "green", cta: "See details" },
  group: { label: "New group", tag: "Group", color: "blue", cta: "Open group" },
  pending: { label: "Waiting on your reply", tag: "Reply", color: "white", cta: "Answer invite" },
};

export interface CalendarData {
  /** First day of the week shown, as `YYYY-MM-DD` (a Monday). */
  weekStart: string;
  /** Today, as `YYYY-MM-DD`. */
  today: string;
  /** The person's weekly pattern, keyed `weekday-hour`. */
  cells: Record<string, Cell>;
  friends: CalendarFriend[];
  /** Friend ids picked at the start. */
  who: string[];
  share: boolean;
  /** Plans the person hosts, is going to, or has been invited to. */
  plans: CalendarPlan[];
}

const set = (
  cells: Record<string, Cell>,
  day: number,
  from: number,
  to: number,
  value: Cell,
) => {
  for (let hour = from; hour <= to; hour++) cells[`${day}-${hour}`] = value;
};

export const sampleCells = () => {
  const cells: Record<string, Cell> = {};
  [0, 2, 4].forEach((day) => set(cells, day, 9, 15, "busy"));
  [1, 3].forEach((day) => {
    set(cells, day, 10, 12, "busy");
    set(cells, day, 14, 15, "busy");
  });
  set(cells, 2, 18, 18, "busy");
  [0, 1, 3].forEach((day) => set(cells, day, 17, 22, "free"));
  set(cells, 2, 20, 22, "free");
  set(cells, 4, 17, 23, "free");
  set(cells, 5, 11, 13, "free");
  set(cells, 5, 14, 15, "busy");
  set(cells, 5, 16, 23, "free");
  set(cells, 6, 10, 17, "free");
  set(cells, 6, 19, 20, "busy");
  return cells;
};

const friendDefs: { id: string; name: string; color: AccentColor }[] = [
  { id: "maya", name: "Maya", color: "red" },
  { id: "dev", name: "Dev", color: "blue" },
  { id: "jo", name: "Jo", color: "yellow" },
  { id: "sam", name: "Sam", color: "green" },
  { id: "priya", name: "Priya", color: "pink" },
  { id: "leo", name: "Leo", color: "purple" },
];

const sampleFree = (index: number, day: number, hour: number, week: number) => {
  if (day <= 4) {
    const from = [18, 17, 19, 16, 18, 20][index];
    return (
      hour >= from &&
      hour <= 22 &&
      !((day + index + week) % 3 === 0 && hour < from + 2)
    );
  }
  return (
    hour >= 11 + (index % 3) &&
    hour <= 23 &&
    (hour + index + day + week) % 5 !== 0
  );
};

export const sampleFriends = (): CalendarFriend[] =>
  friendDefs.map((friend, index) => ({
    ...friend,
    freeByWeek: Array.from({ length: MAX_WEEK_OFFSET + 1 }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => day).flatMap((day) =>
        HOURS.filter((hour) => sampleFree(index, day, hour, week)).map(
          (hour) => `${day}-${hour}`,
        ),
      ),
    ),
  }));

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Sample plans for the week starting `weekStart`. */
export const samplePlans = (weekStart: string): CalendarPlan[] => {
  const dates = weekDatesFor(weekStart);
  const on = (day: number) => iso(dates[day]);
  return [
    { id: "chem", date: on(2), from: 17, to: 18, short: "Chem", title: "Chem lab review", when: "Wed, 5:00 PM", place: "Library, 2nd floor", kind: "pending" },
    { id: "g2", date: on(2), from: 19, to: 22, short: "Games", title: "Board game cafe night", when: "Wed, 7:30 PM", place: "Dice & Dough Cafe", kind: "group" },
    { id: "bio-study", date: on(3), from: 16, to: 18, short: "Bio", title: "Bio 201 study group", when: "Thu, 4:00 PM", place: "Library, 3rd floor", kind: "host" },
    { id: "trivia-crew", date: on(3), from: 20, to: 22, short: "Trivia", title: "Trivia crew", when: "Thu, 8:00 PM", place: "Place still to pick", kind: "host" },
    { id: "taco-night", date: on(4), from: 19, to: 22, short: "Tacos", title: "Taco night", when: "Fri, 7:00 PM", place: "Dev's kitchen", kind: "host" },
    { id: "brunch", date: on(5), from: 10, to: 12, short: "Brunch", title: "Brunch club", when: "Sat, 10:30 AM", place: "Sunny Side Cafe", kind: "going" },
    { id: "devgame", date: on(5), from: 20, to: 23, short: "Dev", title: "Dev's board game night", when: "Sat, 8:00 PM", place: "Dev's place", kind: "going" },
    { id: "hike", date: on(6), from: 9, to: 12, short: "Hike", title: "Sunday morning hike", when: "Sun, 9:00 AM", place: "Ridgeview Trailhead", kind: "group" },
    { id: "movie", date: on(6), from: 12, to: 15, short: "Movie", title: "Movie marathon", when: "Sun, 12:30 PM", place: "Sam's place", kind: "going" },
    { id: "dumplings", date: on(6), from: 16, to: 18, short: "Dumpl.", title: "Dumpling cook-along", when: "Sun, 4:00 PM", place: "Eastside Community Kitchen", kind: "group" },
  ];
};

/** The seven dates of a week, `offset` weeks after `weekStart`. */
export const weekDatesFor = (weekStart: string, offset = 0) => {
  const start = new Date(`${weekStart}T12:00:00`);
  start.setDate(start.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};
