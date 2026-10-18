import type { HubInvite, InviteReply, PlansHub } from "@/data/plans-hub.ts";
import type { PlanCategory } from "@/data/plans.ts";
import { answerInvite, setFriendRequest, setOnCalendar } from "@/lib/plans-repo.ts";

/**
 * Shared state for the plans page. Each component subscribes to the parts it
 * draws. Plans come from the JSON `PlansState` renders, and changes are saved
 * through `plans-repo`.
 */
export type PlansTab = "friends" | "groups";
export type CategoryFilter = "all" | PlanCategory;
export type InviteTab = "pending" | InviteReply;

export interface PlansState {
  tab: PlansTab;
  category: CategoryFilter;
  inviteTab: InviteTab;
  replies: Record<string, InviteReply>;
  /** Plan ids whose share link was copied. */
  copied: Record<string, boolean>;
  /** Plan and group ids on the calendar. */
  added: Record<string, boolean>;
  /** People who got a friend request. */
  requested: Record<string, boolean>;
}

let hub: PlansHub | null = null;
let state: PlansState;
const listeners = new Set<() => void>();

export const getHub = (): PlansHub => {
  if (!hub) {
    const source = document.getElementById("plans-data")?.textContent ?? "{}";
    hub = JSON.parse(source) as PlansHub;
    state = {
      tab: "friends",
      category: "all",
      inviteTab: "pending",
      replies: hub.replies,
      copied: {},
      added: {},
      requested: {},
    };
  }
  return hub;
};

export const get = () => {
  getHub();
  return state;
};

export const update = (patch: Partial<PlansState>) => {
  getHub();
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getHub();
  listeners.add(listener);
  listener();
};

export const replyOf = (invite: HubInvite): InviteTab => get().replies[invite.id] ?? "pending";

export const matchesCategory = (category: PlanCategory) =>
  get().category === "all" || get().category === category;

/** Invites still waiting on the person, whatever the category filter. */
export const pendingCount = () =>
  getHub().invites.filter((invite) => replyOf(invite) === "pending").length;

/** Tells the sidebar and tab bar how many invites are open. */
const announcePending = () =>
  window.dispatchEvent(new CustomEvent("plans:pending", { detail: pendingCount() }));

export const answer = (id: string, reply: InviteReply) => {
  update({ replies: { ...get().replies, [id]: reply } });
  announcePending();
  void answerInvite(id, reply);
};

export const toggleCopied = (id: string) => {
  const copied = !get().copied[id];
  update({ copied: { ...get().copied, [id]: copied } });
};

export const toggleAdded = (id: string) => {
  const added = !get().added[id];
  update({ added: { ...get().added, [id]: added } });
  void setOnCalendar(id, added);
};

export const toggleRequest = (name: string) => {
  const sent = !get().requested[name];
  update({ requested: { ...get().requested, [name]: sent } });
  void setFriendRequest(name, sent);
};
