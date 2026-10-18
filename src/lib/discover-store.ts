import type {
  DiscoverData,
  GroupCategoryId,
  OpenGroup,
  SizeId,
  WhenId,
} from "@/data/discover.ts";
import {
  MIN_FIT,
  SOON_HOURS,
  eligible,
  fitOf,
  findGroups,
  hoursUntil,
  memberOf,
  sizeMatches,
  spotsOpen,
} from "@/lib/discover-fit.ts";
import type { Answers } from "@/lib/discover-fit.ts";
import { joinGroup, leaveGroup } from "@/lib/discover-repo.ts";

/**
 * Shared state for the Discover page. The finder, the filters and the feed each
 * subscribe to the parts they draw. Groups come from the JSON `DiscoverState`
 * renders, and joining is saved through `discover-repo`.
 */
export type Stage = "idle" | "quiz" | "finding" | "result";

export interface DiscoverState {
  stage: Stage;
  /** Quiz question: 0 activity, 1 when, 2 size. */
  question: 0 | 1 | 2;
  want: GroupCategoryId[];
  when: WhenId;
  size: SizeId;
  host: boolean;
  /** "Mix me in" skips the questions. */
  mixed: boolean;
  /** How many of the finding steps are done. */
  step: number;
  /** Which of the ranked matches is on show. */
  pick: number;
  filterCategory: "all" | GroupCategoryId;
  /** Index into `days`, or null for the whole week. */
  filterDay: number | null;
  filterSoon: boolean;
  filterSize: SizeId;
  /** Group ids the viewer joined. */
  joined: Record<string, boolean>;
}

const initial: DiscoverState = {
  stage: "idle",
  question: 0,
  want: [],
  when: "tonight",
  size: "any",
  host: true,
  mixed: false,
  step: 0,
  pick: 0,
  filterCategory: "all",
  filterDay: null,
  filterSoon: false,
  filterSize: "any",
  joined: {},
};

let data: DiscoverData | null = null;
let state: DiscoverState = initial;
let token = 0;
const listeners = new Set<() => void>();

export const getData = (): DiscoverData => {
  if (!data) {
    const source = document.getElementById("discover-data")?.textContent ?? "{}";
    data = JSON.parse(source) as DiscoverData;
  }
  return data;
};

export const get = () => {
  getData();
  return state;
};

export const update = (patch: Partial<DiscoverState>) => {
  getData();
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getData();
  listeners.add(listener);
  listener();
};

/* ---------- time labels ---------- */

export const hourLabel = (hour: number) => {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  const h12 = whole % 12 === 0 ? 12 : whole % 12;
  return `${h12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${whole >= 12 ? "PM" : "AM"}`;
};

/** "Starting now", "In 2 hrs", "Tonight", "Tomorrow", then the weekday. */
export const whenLabel = (group: OpenGroup) => {
  const until = hoursUntil(getData(), group);
  const hours = Math.round(until);
  if (until <= 0) return "Starting now";
  if (until < 1) return "In under 1 hr";
  if (until <= SOON_HOURS) return `In ${hours} hr${hours === 1 ? "" : "s"}`;
  if (group.day === 0) return "Tonight";
  if (group.day === 1) return "Tomorrow";
  return getData().days[group.day].weekday.slice(0, 3);
};

export const whenFull = (group: OpenGroup) =>
  `${group.day === 0 ? "Today" : getData().days[group.day].weekday}, ${hourLabel(group.start)} to ${hourLabel(group.end)}`;

/* ---------- quiz ---------- */

export const startQuiz = () =>
  update({ stage: "quiz", question: 0, want: [], mixed: false });

export const startOver = () => update({ stage: "quiz", question: 0, mixed: false });

export const back = () =>
  get().question === 0 ? update({ stage: "idle" }) : update({ question: (get().question - 1) as 0 | 1 });

/** Two picks at most: a third replaces the oldest. */
export const toggleWant = (id: GroupCategoryId) => {
  const { want } = get();
  update({
    want: want.includes(id)
      ? want.filter((item) => item !== id)
      : want.length >= 2
        ? [want[1], id]
        : [...want, id],
  });
};

export const nextFromActivity = () => {
  if (get().want.length) update({ question: 1 });
};

export const pickWhen = (when: WhenId) => update({ when, question: 2 });

export const toggleHost = () => update({ host: !get().host });

/** Plays the "finding" steps, then shows the result. */
export const startFind = (patch: Partial<DiscoverState> = {}) => {
  const mine = ++token;
  update({ stage: "finding", step: 0, pick: 0, ...patch });
  [450, 900, 1350, 1800, 2250].forEach((delay, index) =>
    setTimeout(() => {
      if (token !== mine) return;
      update(index < 4 ? { step: index + 1 } : { step: 5, stage: "result" });
    }, delay),
  );
};

export const pickSize = (size: SizeId) => startFind({ size });

export const mixMe = () => startFind({ mixed: true });

export const another = () => update({ pick: get().pick + 1 });

/* ---------- derived ---------- */

export const answers = (): Answers => {
  const s = get();
  return s.mixed
    ? { want: [], when: "week", size: "any", host: true }
    : { want: s.want, when: s.when, size: s.size, host: s.host };
};

/** The group the finder shows, and the ranked list it was picked from. */
export const result = () => {
  const { groups, note } = findGroups(getData(), answers());
  const { pick, mixed } = get();
  return {
    group: groups.length ? groups[pick % groups.length] : null,
    count: groups.length,
    note: mixed ? "" : note,
  };
};

export const membersOf = (group: OpenGroup) =>
  group.memberIds.map((id) => memberOf(getData(), id));

/** Spots left once the viewer's own join is counted. */
export const spotsLeft = (group: OpenGroup) =>
  spotsOpen(group) - (get().joined[group.id] ? 1 : 0);

/** Passes the activity and size filters, and the day filters unless `ignoreTime`. */
const filtered = (group: OpenGroup, ignoreTime = false) => {
  const s = get();
  return (
    (s.filterCategory === "all" || group.category === s.filterCategory) &&
    sizeMatches(group, s.filterSize) &&
    (ignoreTime ||
      ((s.filterDay === null || group.day === s.filterDay) &&
        (!s.filterSoon || hoursUntil(getData(), group) <= SOON_HOURS)))
  );
};

/** Feed groups that pass the filters and the mutual fit bar, soonest first. */
export const feed = () => {
  const d = getData();
  const byFit = (a: OpenGroup, b: OpenGroup) => fitOf(d, b).mutual - fitOf(d, a).mutual;
  const bySoon = (a: OpenGroup, b: OpenGroup) =>
    hoursUntil(d, a) - hoursUntil(d, b) || byFit(a, b);
  const shown = d.groups
    .filter((group) => eligible(d, group) && filtered(group) && fitOf(d, group).mutual >= MIN_FIT)
    .sort(bySoon);
  const hidden = d.groups.filter((group) => filtered(group)).length - shown.length;
  return {
    soon: shown.filter((group) => hoursUntil(d, group) <= SOON_HOURS),
    later: shown.filter((group) => hoursUntil(d, group) > SOON_HOURS),
    shown: shown.length,
    hidden,
  };
};

/** One column per day: the viewer's busy blocks and the groups that fit. */
export const week = () => {
  const d = getData();
  return d.days.map((day, index) => ({
    ...day,
    busy: d.busy[index],
    groups: d.groups.filter(
      (group) =>
        group.day === index &&
        eligible(d, group) &&
        filtered(group, true) &&
        fitOf(d, group).mutual >= MIN_FIT,
    ),
  }));
};

/* ---------- joining and filters ---------- */

export const toggleJoin = (id: string) => {
  const joined = !get().joined[id];
  update({ joined: { ...get().joined, [id]: joined } });
  void (joined ? joinGroup(id) : leaveGroup(id));
};

export const clearFilters = () =>
  update({ filterCategory: "all", filterDay: null, filterSoon: false, filterSize: "any" });
