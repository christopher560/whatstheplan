import type { AccentColor } from "@/types.ts";
import type { GroupDetail, GroupMember } from "@/data/group.ts";
import {
  blockMember,
  reportMember,
  sendMessage,
  setGoing,
  vote as saveVote,
} from "@/lib/group-repo.ts";
import { joinGroup, leaveGroup } from "@/lib/discover-repo.ts";
import { setFriendRequest, setOnCalendar } from "@/lib/plans-repo.ts";

/**
 * Shared state for one group's page. Each component subscribes to the part it
 * draws. The group comes from the JSON `GroupState` renders, and changes are
 * saved through `group-repo`, `discover-repo` and `plans-repo`.
 */
export interface GroupViewer {
  name: string;
  color: AccentColor;
}

export interface GroupPage {
  group: GroupDetail;
  viewer: GroupViewer;
}

export interface SentMessage {
  id: string;
  text: string;
  time: string;
}

export interface GroupViewState {
  /** The viewer's answer to the group's plan. */
  going: boolean | null;
  onCalendar: boolean;
  /** Poll option the viewer picked. */
  vote: string | null;
  sent: SentMessage[];
  blocked: Record<string, boolean>;
  reported: Record<string, boolean>;
  /** Friend requests sent, by member id. */
  friends: Record<string, boolean>;
  /** Member whose options are open. */
  menu: string | null;
  /** Member being reported. */
  reporting: string | null;
  leaveAsk: boolean;
  left: boolean;
  toast: string;
}

let page: GroupPage | null = null;
let state: GroupViewState;
const listeners = new Set<() => void>();

export const getPage = (): GroupPage => {
  if (!page) {
    const source = document.getElementById("group-data")?.textContent ?? "{}";
    page = JSON.parse(source) as GroupPage;
    state = {
      going: page.group.going,
      onCalendar: page.group.onCalendar,
      vote: null,
      sent: [],
      blocked: {},
      reported: {},
      friends: {},
      menu: null,
      reporting: null,
      leaveAsk: false,
      left: false,
      toast: "",
    };
  }
  return page;
};

export const group = () => getPage().group;
export const viewer = () => getPage().viewer;

export const get = () => {
  getPage();
  return state;
};

export const update = (patch: Partial<GroupViewState>) => {
  getPage();
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getPage();
  listeners.add(listener);
  listener();
};

export const memberById = (id: string): GroupMember | undefined =>
  group().members.find((member) => member.id === id);

export type StatusTone = "locked" | "waiting" | "forming";

/** Headcounts and the status line, worked out from who has said yes. */
export const status = () => {
  const g = group();
  const total = g.members.length + 1;
  const going = g.members.filter((member) => member.going).length + (get().going ? 1 : 0);
  const open = g.capacity - total;
  const needed = g.minimum - going;
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

  let tone: StatusTone = "waiting";
  let label = `${needed} more ${plural(needed, "yes", "yeses")} to lock it in`;
  if (total < g.minimum) {
    tone = "forming";
    const missing = g.minimum - total;
    label = `Needs ${missing} more ${plural(missing, "person", "people")}`;
  } else if (going >= g.minimum) {
    tone = "locked";
    label = "Locked in";
  }
  return { total, going, open, tone, label };
};

export const setAnswer = (answer: boolean) => {
  const next = get().going === answer ? null : answer;
  update({ going: next });
  void setGoing(group().id, next);
};

export const toggleCalendar = () => {
  const added = !get().onCalendar;
  update({ onCalendar: added });
  void setOnCalendar(group().id, added);
};

export const castVote = (optionId: string) => {
  const next = get().vote === optionId ? null : optionId;
  update({ vote: next });
  void saveVote(group().id, next);
};

export const send = (text: string) => {
  const clean = text.trim().slice(0, 500);
  if (!clean) return false;
  update({
    sent: [...get().sent, { id: `sent-${get().sent.length}`, text: clean, time: "Just now" }],
  });
  void sendMessage(group().id, clean);
  return true;
};

export const toggleMenu = (memberId: string) =>
  update({ menu: get().menu === memberId ? null : memberId, reporting: null });

export const startReport = (memberId: string) => update({ reporting: memberId, menu: null });

export const block = (memberId: string) => {
  const member = memberById(memberId);
  update({
    blocked: { ...get().blocked, [memberId]: true },
    menu: null,
    toast: `${member?.name ?? "They"} is blocked. You will not see their messages.`,
  });
  void blockMember(memberId);
};

export const report = (memberId: string, reasonId: string) => {
  const member = memberById(memberId);
  update({
    reporting: null,
    reported: { ...get().reported, [memberId]: true },
    toast: `Thanks. We will take a look. ${member?.name ?? "They"} does not know who reported.`,
  });
  void reportMember(memberId, reasonId);
};

export const toggleFriend = (memberId: string) => {
  const member = memberById(memberId);
  if (!member) return;
  const sent = !get().friends[memberId];
  update({
    friends: { ...get().friends, [memberId]: sent },
    toast: sent
      ? `Friend request sent to ${member.name}. They will see you in their list if they accept.`
      : "",
  });
  void setFriendRequest(member.name, sent);
};

export const askLeave = (ask: boolean) => update({ leaveAsk: ask });

export const confirmLeave = () => {
  update({ left: true, leaveAsk: false, toast: "" });
  void leaveGroup(group().id);
};

export const undoLeave = () => {
  update({ left: false });
  void joinGroup(group().id);
};

export const dismissToast = () => update({ toast: "" });
