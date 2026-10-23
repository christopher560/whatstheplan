import type { AccentColor } from "@/types.ts";

/** Why someone can be reported. Stable ids, labels can be reworded. */
export const reportReasons: { id: string; label: string }[] = [
  { id: "unsafe", label: "Rude or unsafe" },
  { id: "spam", label: "Spam" },
  { id: "fake", label: "Fake profile" },
];

/** One-tap openers for people who do not know what to say. */
export const chatStarters = [
  "Hi, I am {name}. First time here!",
  "What should I bring?",
  "Anyone want to carpool?",
];

export interface GroupMember {
  /** Primary key of the `profiles` row. */
  id: string;
  name: string;
  color: AccentColor;
  /** One line about them, "Brings Catan". */
  note: string;
  /** Said yes to the plan. */
  going: boolean;
}

/** A line in the chat. System lines are joins and leaves. */
export interface ChatItem {
  /** Order of the line in the group's chat; new lines have a higher number. */
  seq: number;
  kind: "system" | "message";
  text: string;
  /** When it was sent, as an ISO time. */
  at: string;
  /** The viewer wrote it. */
  mine: boolean;
  /** The sender's stand-in id for this group, or null for a system line or someone who left. */
  handle: string | null;
  name: string;
  /** The sender's avatar color as hex. */
  color: string | null;
  /** Shown at once, before the database has saved it. */
  pending?: boolean;
}

export interface GroupPollOption {
  id: string;
  label: string;
  /** Ids of the other members who voted for it. */
  voters: string[];
}

export interface GroupPoll {
  /** Primary key of the `group_polls` row. */
  id?: string;
  question: string;
  options: GroupPollOption[];
  /** The option the viewer voted for. */
  mine?: string | null;
}

/**
 * One group the viewer joined from Discover. Maps to `meetup_groups`,
 * `meetup_members` and `group_messages` (see SUPABASE.md).
 */
export interface GroupDetail {
  /** Primary key of the `meetup_groups` row. */
  id: string;
  title: string;
  /** Activity label shown on the tag. */
  category: string;
  color: AccentColor;
  /** Short name of the activity, "Board games". */
  short: string;
  what: string;
  tags: string[];
  place: string;
  /** Street and distance, "218 Maple St · 0.8 mi away". */
  address: string;
  when: string;
  /** "In 3 hours" */
  countdown: string;
  /** "about 2 hours" */
  lasts?: string;
  capacity: number;
  /** People needed for it to go ahead. */
  minimum: number;
  /** The other members. The viewer is added by the page. */
  members: GroupMember[];
  poll?: GroupPoll;
  /** The latest lines in the chat when the page opened. */
  chat: ChatItem[];
  /** The viewer's answer when the page opens. */
  going: boolean | null;
  onCalendar: boolean;
  /** The viewer started this group, so they can ask it a question. */
  isHost?: boolean;
  /** People in it other than the viewer, and how many said yes. Includes starter organizers. */
  counts?: { total: number; going: number };
  /** Organizers of a starter group, who are not accounts. */
  organizers?: { label: string; count: number };
  /** Where the time downloads as a calendar file. */
  calendarHref?: string;
}
