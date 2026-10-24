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
  locked: string | null;
  copied: boolean;
  description: string;
  editing: boolean;
  sent: Record<string, boolean>;
  /** People the host sent a friend request to from this page, by member id. */
  friendReq: Record<string, boolean>;
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
      locked: plan.lockedSlot,
      copied: false,
      description: plan.description,
      editing: false,
      sent: {},
      friendReq: {},
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

export const toggleLock = (slotId: string) => {
  const unlock = get().locked === slotId;
  update({
    locked: unlock ? null : slotId,
    feed: unlock
      ? get().feed
      : addFeed(
          `locked in ${slotLabel(slotId).replace(" · ", " at ")}`,
          "Everyone with the link sees it and can add it to their calendar",
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

/** The host asks someone in the plan to be friends. The button reads "Request sent" at once. */
export const requestFriend = (memberId: string) => {
  if (get().friendReq[memberId]) return;
  update({ friendReq: { ...get().friendReq, [memberId]: true } });
  void repo.addMemberFriend(memberId).then((result) => {
    if (!result.ok) update({ friendReq: { ...get().friendReq, [memberId]: false } });
  });
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

/**
 * Takes the latest plan from the server. Replies, votes, the feed and the locked time update in place.
 * A new person or time cannot be drawn in place, so that returns "reload".
 */
export const applyLive = (next: PlanDetail): "ok" | "reload" => {
  const current = getPlan();
  const ids = (list: { id: string }[]) => list.map((item) => item.id).sort().join(",");
  if (ids(current.friends) !== ids(next.friends) || ids(current.slots) !== ids(next.slots)) return "reload";
  /* Change the object the components already hold, so none of them is left looking at an old copy. */
  Object.assign(current, { friends: next.friends, stage: next.stage, comfort: next.comfort, perPerson: next.perPerson });
  update({
    replies: Object.fromEntries(next.friends.map((friend) => [friend.id, friend.reply])),
    votes: Object.fromEntries(next.friends.map((friend) => [friend.id, friend.votes])),
    feed: next.feed,
    locked: next.lockedSlot,
    description: get().editing ? get().description : next.description,
    tick: get().tick + 1,
  });
  return "ok";
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
