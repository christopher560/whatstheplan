import type { AccentColor } from "@/types.ts";
import type { ChatItem, GroupDetail, GroupMember } from "@/data/group.ts";
import {
  blockMember,
  createPoll,
  fetchMessages,
  friendMember,
  reportMember,
  sendMessage,
  setGoing,
  vote as saveVote,
} from "@/lib/group-repo.ts";
import type { ReportReason } from "@/lib/group-repo.ts";
import { joinGroup, leaveGroup } from "@/lib/discover-repo.ts";

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

export interface GroupViewState {
  /** The viewer's answer to the group's plan. */
  going: boolean | null;
  onCalendar: boolean;
  /** Poll option the viewer picked. */
  vote: string | null;
  /** Chat lines from the database, oldest first. */
  chat: ChatItem[];
  /** Lines the viewer just sent that are not saved yet. */
  pending: ChatItem[];
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
      vote: page.group.poll?.mine ?? null,
      chat: page.group.chat,
      pending: [],
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
  /* The database counts everyone else, including people the viewer blocked and starter organizers. */
  const total = (g.counts?.total ?? g.members.length) + 1;
  const going = (g.counts?.going ?? g.members.filter((member) => member.going).length) + (get().going ? 1 : 0);
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

/** Puts the toast up when the database said no, and the page back as it was. */
const sorry = (message: string, undo: Partial<GroupViewState>) => update({ ...undo, toast: message });

export const setAnswer = (answer: boolean) => {
  const before = get().going;
  const next = before === answer ? null : answer;
  update({ going: next });
  void setGoing(group().id, next).then((result) => {
    if (!result.ok) sorry("That didn't save. Please try again.", { going: before });
  });
};

export const castVote = (optionId: string) => {
  const poll = group().poll;
  if (!poll?.id) return;
  const before = get().vote;
  const next = before === optionId ? null : optionId;
  update({ vote: next });
  void saveVote(poll.id, next).then((result) => {
    if (!result.ok) sorry("That vote didn't save. Please try again.", { vote: before });
  });
};

/** The person who started the group asks it a question. The page reloads to show it. */
export const askGroup = async (question: string, options: string[]) => {
  const result = await createPoll(group().id, question, options);
  if (result.ok) location.reload();
  return result;
};

let fetching = false;

/** Asks for lines newer than the last one shown. Called every few seconds while the page is open. */
export const loadNew = async () => {
  if (fetching) return;
  fetching = true;
  const last = get().chat.reduce((top, line) => Math.max(top, line.seq), 0);
  const result = await fetchMessages(group().id, last);
  fetching = false;
  if (!result.ok || result.lines.length === 0) return;
  const known = new Set(get().chat.map((line) => line.seq));
  const fresh = result.lines.filter((line) => !known.has(line.seq));
  if (fresh.length) update({ chat: [...get().chat, ...fresh] });
};

let sentCount = 0;

/** Shows the line at once, saves it, then fetches so the saved copy replaces it. */
export const send = (text: string) => {
  const clean = text.trim().slice(0, 500);
  if (!clean) return false;
  const line: ChatItem = {
    seq: -(++sentCount),
    kind: "message",
    text: clean,
    at: new Date().toISOString(),
    mine: true,
    handle: null,
    name: viewer().name,
    color: null,
    pending: true,
  };
  update({ pending: [...get().pending, line] });
  void sendMessage(group().id, clean).then(async (result) => {
    if (result.ok) await loadNew();
    else update({ toast: result.error });
    update({ pending: get().pending.filter((item) => item.seq !== line.seq) });
  });
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
    toast: `${member?.name ?? "They"} is blocked. You will not see them again.`,
  });
  void blockMember(group().id, memberId).then((result) => {
    if (!result.ok) sorry("That didn't save. Please try again.", { blocked: { ...get().blocked, [memberId]: false } });
  });
};

export const report = (memberId: string, reasonId: string) => {
  const member = memberById(memberId);
  update({
    reporting: null,
    reported: { ...get().reported, [memberId]: true },
    toast: `Thanks. We will take a look. ${member?.name ?? "They"} does not know who reported.`,
  });
  void reportMember(group().id, memberId, reasonId as ReportReason).then((result) => {
    if (!result.ok) sorry("That didn't send. Please try again.", { reported: { ...get().reported, [memberId]: false } });
  });
};

/** A friend request to someone in the group. It cannot be taken back from here. */
export const toggleFriend = (memberId: string) => {
  const member = memberById(memberId);
  if (!member || get().friends[memberId]) return;
  update({
    friends: { ...get().friends, [memberId]: true },
    toast: `Friend request sent to ${member.name}. They will see you in their list if they accept.`,
  });
  void friendMember(group().id, memberId).then((result) => {
    if (!result.ok) sorry("That didn't send. Please try again.", { friends: { ...get().friends, [memberId]: false } });
  });
};

/**
 * Takes the latest group from the server. Who is going and the poll votes update in place.
 * A person joining or leaving, or a new question, cannot be drawn in place, so that returns "reload".
 */
export const applyLive = (next: GroupDetail): "ok" | "reload" => {
  const current = group();
  const ids = (list: { id: string }[]) => list.map((item) => item.id).sort().join(",");
  const options = (poll?: GroupDetail["poll"]) => `${poll?.id ?? ""}:${ids(poll?.options ?? [])}`;
  if (ids(current.members) !== ids(next.members) || options(current.poll) !== options(next.poll)) return "reload";
  /* Change the objects the components already hold, so none of them is left looking at an old copy. */
  next.members.forEach((member) => {
    const mine = current.members.find((item) => item.id === member.id);
    if (mine) Object.assign(mine, { going: member.going, note: member.note });
  });
  next.poll?.options.forEach((option) => {
    const mine = current.poll?.options.find((item) => item.id === option.id);
    if (mine) mine.voters = option.voters;
  });
  Object.assign(current, { counts: next.counts, capacity: next.capacity, minimum: next.minimum });
  update({});
  return "ok";
};

export const askLeave = (ask: boolean) => update({ leaveAsk: ask });

export const confirmLeave = () => {
  update({ left: true, leaveAsk: false, toast: "" });
  void leaveGroup(group().id).then((result) => {
    if (!result.ok) sorry("That didn't save. Please try again.", { left: false });
  });
};

/** Taking the spot back can fail if someone else took it, and then the page says so. */
export const undoLeave = () => {
  update({ left: false });
  void joinGroup(group().id).then((result) => {
    if (!result.ok) sorry(result.error, { left: true });
  });
};

export const dismissToast = () => update({ toast: "" });
