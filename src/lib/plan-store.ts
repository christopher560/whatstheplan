import type { FeedItem, PlanDetail, Reply } from "@/data/plan-detail.ts";
import * as repo from "@/lib/plan-repo.ts";

/**
 * Shared state for one plan's replies page. Each component subscribes to the
 * part it draws. The plan comes from the JSON `PlanState` renders, and every
 * change is saved through `plan-repo`. `applyReply` is where Supabase Realtime
 * will push a friend's reply in later.
 */
export interface PlanViewState {
  replies: Record<string, Reply>;
  votes: Record<string, string[]>;
  feed: FeedItem[];
  nudged: boolean;
  auto: boolean;
  locked: string | null;
  copied: boolean;
  description: string;
  editing: boolean;
  sent: Record<string, boolean>;
  /** Bumps on each change, to replay swap animations. */
  tick: number;
}

let plan: PlanDetail | null = null;
let state: PlanViewState;
const listeners = new Set<() => void>();

export const getPlan = (): PlanDetail => {
  if (!plan) {
    const source = document.getElementById("plan-data")?.textContent ?? "{}";
    plan = JSON.parse(source) as PlanDetail;
    state = {
      replies: Object.fromEntries(plan.friends.map((f) => [f.id, f.reply])),
      votes: Object.fromEntries(plan.friends.map((f) => [f.id, f.votes])),
      feed: plan.feed,
      nudged: false,
      auto: plan.autoNudge,
      locked: plan.lockedSlot,
      copied: false,
      description: plan.description,
      editing: false,
      sent: {},
      tick: 0,
    };
  }
  return plan;
};

export const get = () => {
  getPlan();
  return state;
};

export const update = (patch: Partial<PlanViewState>) => {
  getPlan();
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getPlan();
  listeners.add(listener);
  listener();
};

const addFeed = (text: string, detail: string): FeedItem[] => [
  { who: "You", color: "orange", text, detail, time: "just now" },
  ...get().feed,
];

export const slotLabel = (id: string) =>
  getPlan().slots.find((slot) => slot.id === id)?.label ?? "";

/** "Sat, Oct 24 · 11 AM" becomes "Sat 11 AM". */
export const shortSlot = (id: string) =>
  slotLabel(id).replace(/^(\w+), \w+ \d+ · /, "$1 ");

export const counts = () => {
  const total = { in: 0, maybe: 0, out: 0, wait: 0 };
  getPlan().friends.forEach((friend) => {
    const reply = get().replies[friend.id];
    if (reply) total[reply] += 1;
    else total.wait += 1;
  });
  return total;
};

export const waitingFriends = () =>
  getPlan().friends.filter((friend) => !get().replies[friend.id]);

export const tally = (slotId: string) =>
  getPlan().friends.filter((friend) => get().votes[friend.id]?.includes(slotId));

export const nudgeWaiting = () => {
  const names = waitingFriends();
  if (names.length === 0 || get().nudged) return;
  update({
    nudged: true,
    feed: addFeed(
      `nudged ${names.map((f) => f.name).join(" and ")}`,
      "Text reminders are not switched on yet",
    ),
    tick: get().tick + 1,
  });
  void repo.nudge(getPlan().id, names.map((f) => f.id));
};

export const toggleAuto = () => {
  update({ auto: !get().auto });
  void repo.setAutoNudge(getPlan().id, get().auto);
};

export const toggleLock = (slotId: string) => {
  const unlock = get().locked === slotId;
  update({
    locked: unlock ? null : slotId,
    feed: unlock
      ? get().feed
      : addFeed(
          `locked in ${slotLabel(slotId).replace(" · ", " at ")}`,
          "Everyone going was notified and it is on their calendars",
        ),
    tick: get().tick + 1,
  });
  void repo.lockTime(getPlan().id, unlock ? null : slotId);
};

export const saveDescription = (text: string) => {
  const next = text.trim() || get().description;
  update({
    description: next,
    editing: false,
    feed: addFeed("updated the description", "Friends will see the new text"),
    tick: get().tick + 1,
  });
  void repo.saveDescription(getPlan().id, next);
};

export const sendQuickUpdate = (message: string) => {
  if (get().sent[message]) return;
  update({
    sent: { ...get().sent, [message]: true },
    feed: addFeed(`sent an update to ${getPlan().friends.length} friends`, message),
    tick: get().tick + 1,
  });
  void repo.sendUpdate(getPlan().id, message);
};

/** A message the host typed. Unlike the quick ones it can be sent again with new words. */
export const sendCustomUpdate = (text: string) => {
  const message = text.trim().slice(0, 120);
  if (!message) return;
  update({
    feed: addFeed(`sent an update to ${getPlan().friends.length} friends`, message),
    tick: get().tick + 1,
  });
  void repo.sendUpdate(getPlan().id, message);
};

export const applyReply = (friendId: string, reply: Reply, votes: string[]) => {
  const friend = getPlan().friends.find((item) => item.id === friendId);
  if (!friend) return;
  const label = reply === "in" ? "is in" : reply === "maybe" ? "is a maybe" : "can't make it";
  update({
    replies: { ...get().replies, [friendId]: reply },
    votes: { ...get().votes, [friendId]: votes },
    feed: [
      {
        who: friend.name,
        color: friend.color,
        text: label,
        detail: votes.length ? `Picked ${votes.map(shortSlot).join(" and ")}` : "No time picked",
        time: "just now",
      },
      ...get().feed,
    ],
    tick: get().tick + 1,
  });
};
