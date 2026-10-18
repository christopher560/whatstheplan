import { MAX_CIRCLE, MAX_FRIEND_WEEK, dayNames } from "@/data/friends.ts";
import type { Friend, FriendsData } from "@/data/friends.ts";
import {
  acceptRequest,
  declineRequest,
  setCircle,
  setFavorite,
  setTags,
} from "@/lib/friends-repo.ts";

/**
 * Shared state for the friends page. Each component subscribes to the parts it
 * draws. Friends come from the JSON `FriendsState` renders, and changes are
 * saved through `friends-repo`.
 */
export interface FriendsState {
  circle: string[];
  favorites: Record<string, boolean>;
  tags: Record<string, string[]>;
  /** Friend whose tags are open for editing. */
  tagEdit: string | null;
  draft: string;
  /** "all", "fav", "circle", "free", or "tag:<label>". */
  filter: string;
  query: string;
  /** Weeks ahead shown in the group heatmap. */
  week: number;
  notice: string;
  accepted: Record<string, boolean>;
  declined: Record<string, boolean>;
  copied: boolean;
}

let data: FriendsData | null = null;
let state: FriendsState;
const listeners = new Set<() => void>();

export const getData = (): FriendsData => {
  if (!data) {
    const source = document.getElementById("friends-data")?.textContent ?? "{}";
    data = JSON.parse(source) as FriendsData;
    const everyone = [...data.friends, ...data.requests];
    state = {
      circle: data.circle,
      favorites: Object.fromEntries(data.favorites.map((id) => [id, true])),
      tags: Object.fromEntries(everyone.map((friend) => [friend.id, friend.tags])),
      tagEdit: null,
      draft: "",
      filter: "all",
      query: "",
      week: 0,
      notice: "",
      accepted: {},
      declined: {},
      copied: false,
    };
  }
  return data;
};

export const get = () => {
  getData();
  return state;
};

export const update = (patch: Partial<FriendsState>) => {
  getData();
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getData();
  listeners.add(listener);
  listener();
};

/* ---------- people ---------- */

/** Friends plus the requests the viewer accepted. */
export const people = (): Friend[] => [
  ...getData().friends,
  ...getData().requests.filter((request) => get().accepted[request.id]),
];

export const personById = (id: string) => people().find((friend) => friend.id === id);

export const circleMembers = (): Friend[] =>
  get()
    .circle.map(personById)
    .filter((friend): friend is Friend => !!friend);

export const isInCircle = (id: string) => get().circle.includes(id);

export const tagsOf = (id: string) => get().tags[id] ?? [];

export const openRequests = () =>
  getData().requests.filter((request) => !get().accepted[request.id] && !get().declined[request.id]);

export const freeTonight = () => people().filter((friend) => friend.tone === "free").length;

/* ---------- circle ---------- */

export const toggleCircle = (id: string) => {
  const { circle } = get();
  if (circle.includes(id)) {
    const next = circle.filter((item) => item !== id);
    update({ circle: next, notice: "" });
    void setCircle(next);
  } else if (circle.length >= MAX_CIRCLE) {
    update({ notice: `A group holds ${MAX_CIRCLE}. Remove someone first to make room.` });
  } else {
    const next = [...circle, id];
    update({ circle: next, notice: "" });
    void setCircle(next);
  }
};

const parse = (value: string) => new Date(`${value}T12:00:00`);

const dateOf = (week: number, day: number) => {
  const date = parse(getData().weekStart);
  date.setDate(date.getDate() + week * 7 + day);
  return date;
};

export const weekLabel = () => {
  const { week } = get();
  if (week === 0) return "This week";
  const first = dateOf(week, 0);
  const last = dateOf(week, 6);
  const month = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });
  return `${month(first)} ${first.getDate()} to ${
    first.getMonth() === last.getMonth() ? "" : `${month(last)} `
  }${last.getDate()}`;
};

export const weekOf = (friend: Friend) => friend.weeks[get().week] ?? friend.weeks[0];

/** Which days the circle is free, and the best day still ahead. */
export const circleWeek = () => {
  const members = circleMembers();
  const { week } = get();
  const { todayIndex } = getData();
  const counts = dayNames.map((_, day) => members.filter((friend) => weekOf(friend)[day]).length);
  let bestDay = -1;
  let bestCount = 0;
  for (let day = week === 0 ? todayIndex : 0; day < 7; day++) {
    if (counts[day] > bestCount) {
      bestCount = counts[day];
      bestDay = day;
    }
  }
  const canPlan = bestDay >= 0 && bestCount >= 2;
  const today = week === 0 ? todayIndex : -1;
  const date = canPlan ? dateOf(week, bestDay) : null;
  return {
    members,
    counts,
    total: members.length,
    bestDay: canPlan ? bestDay : -1,
    canPlan,
    allFree: canPlan && bestCount === members.length,
    bestCount,
    today,
    when: canPlan
      ? bestDay === today
        ? "Tonight"
        : `${dayNames[bestDay]}${
            week > 0
              ? `, ${date!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""
          }`
      : "",
  };
};

/* ---------- plan links ---------- */

/** The dashboard builder reads these to pre-fill friends and a time. */
export const planHref = (ids: string[], when: string, from: "group" | "friend") =>
  `/app/dashboard?${new URLSearchParams({ with: ids.join(","), ...(when ? { when } : {}), from })}#builder`;

/** "Tonight", or the next free line without its label. */
export const whenHint = (friend: Friend) =>
  friend.tone === "free"
    ? "Tonight"
    : friend.tone === "maybe"
      ? "Tonight, if they can"
      : friend.nextFree.replace(/^Next free: /, "").replace(/\.$/, "");

/* ---------- list ---------- */

export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

const matches = (friend: Friend, id: string) =>
  id === "all"
    ? true
    : id === "circle"
      ? isInCircle(friend.id)
      : id === "fav"
        ? !!get().favorites[friend.id]
        : id === "free"
          ? friend.tone === "free"
          : tagsOf(friend.id).includes(id.slice(4));

/** Fixed filters, then one per tag, most used first. */
export const filterOptions = (): FilterOption[] => {
  const everyone = people();
  const counts = new Map<string, number>();
  everyone.forEach((friend) =>
    tagsOf(friend.id).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)),
  );
  const tags = [...counts.keys()].sort(
    (a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b),
  );
  return [
    { id: "all", label: "All" },
    { id: "fav", label: "Favorites" },
    { id: "circle", label: "In group" },
    { id: "free", label: "Free tonight" },
    ...tags.map((tag) => ({ id: `tag:${tag}`, label: tag })),
  ].map((option) => ({
    ...option,
    count: everyone.filter((friend) => matches(friend, option.id)).length,
  }));
};

/** The filter in use, falling back to "all" when its tag no longer exists. */
export const activeFilter = () =>
  filterOptions().some((option) => option.id === get().filter) ? get().filter : "all";

const rank = { free: 0, maybe: 1, busy: 2, away: 3 };

/** Who shows in the list: favorites first, then the group, then by how free they are. */
export const listed = (): Friend[] => {
  const filter = activeFilter();
  const query = get().query.trim().toLowerCase();
  const flag = (value: boolean) => (value ? 1 : 0);
  return people()
    .filter((friend) => matches(friend, filter) && (!query || friend.name.toLowerCase().includes(query)))
    .sort(
      (a, b) =>
        flag(!!get().favorites[b.id]) - flag(!!get().favorites[a.id]) ||
        flag(isInCircle(b.id)) - flag(isInCircle(a.id)) ||
        rank[a.tone] - rank[b.tone],
    );
};

/** Tags that are not on this friend yet, to offer as quick adds. */
export const tagChoices = (id: string, presets: string[]) => {
  const mine = tagsOf(id).map((tag) => tag.toLowerCase());
  const everyTag = filterOptions()
    .filter((option) => option.id.startsWith("tag:"))
    .map((option) => option.label);
  const seen = new Set<string>();
  return [...presets, ...everyTag]
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key) || mine.includes(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
};

export const addTag = (id: string, raw: string, presets: string[]) => {
  const name = raw.trim().slice(0, 20);
  if (!name) return;
  const mine = tagsOf(id);
  if (mine.some((tag) => tag.toLowerCase() === name.toLowerCase())) return update({ draft: "" });
  const known = [...presets, ...filterOptions().map((option) => option.label)];
  const label = known.find((tag) => tag.toLowerCase() === name.toLowerCase()) ?? name;
  const next = [...mine, label];
  update({ tags: { ...get().tags, [id]: next }, draft: "" });
  void setTags(id, next);
};

export const removeTag = (id: string, tag: string) => {
  const next = tagsOf(id).filter((item) => item !== tag);
  update({ tags: { ...get().tags, [id]: next } });
  void setTags(id, next);
};

export const toggleFavorite = (id: string) => {
  const favorite = !get().favorites[id];
  update({ favorites: { ...get().favorites, [id]: favorite } });
  void setFavorite(id, favorite);
};

export const accept = (id: string) => {
  update({ accepted: { ...get().accepted, [id]: true } });
  void acceptRequest(id);
};

export const decline = (id: string) => {
  update({ declined: { ...get().declined, [id]: true } });
  void declineRequest(id);
};

export const maxWeek = MAX_FRIEND_WEEK;
