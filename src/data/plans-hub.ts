import type { AccentColor } from "@/types.ts";
import type { PlanCategory } from "@/data/plans.ts";

/** The answer to an invite. No entry means the person has not answered yet. */
export type InviteReply = "in" | "out";

/** An invite from a friend. Maps to a `plan_members` row for the viewer. */
export interface HubInvite {
  /** Primary key of the `plan_members` row. */
  id: string;
  category: PlanCategory;
  from: string;
  title: string;
  when: string;
  place: string;
  cost: string;
  /** "6 of 9 have replied" */
  who: string;
  /** "Reply by Oct 20", empty when there is no deadline. */
  due: string;
  /** First names of the others invited. */
  crew: string[];
  /** Avatar colors for `from` and `crew`, in the same order. */
  fromColor?: AccentColor;
  crewColors?: AccentColor[];
  /** The plan's public slug, and whether it has a time to put on a calendar. */
  slug?: string;
  hasTime?: boolean;
  /** The `plans` row, and whether the person put it on their in-app calendar. */
  planId?: string;
  pinned?: boolean;
}

/** A plan the viewer hosts. */
export interface HubHosted {
  /** Primary key of the `plans` row, also the plan page id. */
  id: string;
  category: PlanCategory;
  title: string;
  when: string;
  place: string;
  cost: string;
  crew: string[];
  crewColors?: AccentColor[];
  /** The public link is `/p/{slug}`. */
  slug?: string;
  replied: number;
  invited: number;
}

/** A plan someone else hosts that the viewer is in. */
export interface HubGoing {
  id: string;
  category: PlanCategory;
  host: string;
  title: string;
  when: string;
  place: string;
  cost: string;
  crew: string[];
  crewColors?: AccentColor[];
  who: string;
}

export type GroupStatus = "ok" | "wait" | "form";

/** A group the viewer joined from Discover. Maps to `meetup_members`. */
export interface HubGroup {
  /** Primary key of the `meetup_groups` row. */
  id: string;
  /** Activity label shown on the tag. */
  category: string;
  color: AccentColor;
  title: string;
  when: string;
  place: string;
  countdown: string;
  members: string[];
  status: GroupStatus;
  /** Latest chat line, "Maya: I'll bring Catan." */
  last: string;
  unread: number;
  /** Open vote, empty when there is none. */
  vote: string;
  /** Overrides the standard text for `status`, with the real numbers. */
  statusLabel?: string;
  /** Avatar colors for `members`, in the same order. */
  memberColors?: AccentColor[];
}

/** A group that already met, with the people the viewer can add as friends. */
export interface HubPast {
  id: string;
  title: string;
  initial: string;
  sub: string;
  color: AccentColor;
  people: string[];
}

export interface PlansHub {
  /** Answers already given, by invite id. */
  replies: Record<string, InviteReply>;
  invites: HubInvite[];
  hosting: HubHosted[];
  going: HubGoing[];
  groups: HubGroup[];
  past: HubPast[];
}

const people: Record<string, AccentColor> = {
  Maya: "pink",
  Jo: "purple",
  Priya: "yellow",
  Leo: "blue",
  Ana: "green",
  Sam: "orange",
  Zoe: "red",
  Dev: "blue",
  You: "green",
  Mia: "green",
  Lee: "purple",
};

/** Avatar color for a first name. No photos, just an initial on a color. */
export const personColor = (name: string): AccentColor => people[name] ?? "yellow";

export const statusLabels: Record<GroupStatus, { label: string; color: AccentColor }> = {
  ok: { label: "Confirmed", color: "green" },
  wait: { label: "Waiting on 1 to confirm", color: "yellow" },
  form: { label: "Forming. Needs 1 more", color: "orange" },
};

export const samplePlansHub: PlansHub = {
  replies: { brunch: "in", devgame: "in", escape: "out", concert: "out" },
  invites: [
    { id: "maya", category: "formal", from: "Maya", title: "Maya's birthday dinner", when: "Sat, Oct 24, 7:30 PM", place: "Maya's pick, smart casual", cost: "$30 each", who: "6 of 9 have replied", due: "Reply by Oct 20", crew: ["Maya", "Priya", "Leo", "Sam"] },
    { id: "chem", category: "school", from: "Priya", title: "Chem lab review", when: "Wed, 5:00 PM", place: "Library, 2nd floor", cost: "Free", who: "3 of 5 have replied", due: "Reply by Tue", crew: ["Priya", "Zoe", "Leo"] },
    { id: "brunch", category: "hangout", from: "Zoe", title: "Brunch club", when: "Sat, 10:30 AM", place: "Sunny Side Cafe", cost: "$12 each", who: "5 of 6 have replied", due: "", crew: ["Zoe", "Ana", "Mia", "Sam"] },
    { id: "devgame", category: "hangout", from: "Dev", title: "Dev's board game night", when: "Sat, 8:00 PM", place: "Dev's place", cost: "$6 each", who: "4 of 5 have replied", due: "", crew: ["Dev", "Jo", "Maya"] },
    { id: "escape", category: "hangout", from: "Leo", title: "Escape room", when: "Sat, 8:00 PM", place: "Escape Hub", cost: "$22 each", who: "3 of 6 have replied", due: "", crew: ["Leo", "Sam", "Priya"] },
    { id: "concert", category: "hangout", from: "Mia", title: "Concert in the park", when: "Sun, 6:00 PM", place: "Lakeview Park", cost: "Free", who: "7 of 12 have replied", due: "", crew: ["Mia", "Zoe", "Lee"] },
    { id: "karaoke", category: "hangout", from: "Jo", title: "Karaoke night", when: "Sat, Oct 24, 9:00 PM", place: "Sing Sing Lounge", cost: "$12 each", who: "4 of 8 have replied", due: "Reply by Oct 21", crew: ["Jo", "Maya", "Dev", "Sam"] },
  ],
  hosting: [
    { id: "taco-night", category: "hangout", title: "Taco night", when: "Fri, 7:00 PM", place: "Dev's kitchen", cost: "$14 each", crew: ["Dev", "Maya", "Jo", "Sam", "Priya"], replied: 5, invited: 5 },
    { id: "bio-study", category: "school", title: "Bio 201 study group", when: "Thu, 4:00 PM", place: "Library, 3rd floor", cost: "Free", crew: ["Priya", "Sam", "Leo", "Zoe"], replied: 6, invited: 6 },
    { id: "beach-day", category: "hangout", title: "Beach day", when: "Sat or Sun, deciding by Fri", place: "The lakefront", cost: "~$20 each", crew: ["Maya", "Dev", "Priya"], replied: 3, invited: 5 },
    { id: "trivia-crew", category: "hangout", title: "Trivia crew", when: "Thu, 8:00 PM", place: "Place still to pick", cost: "$5 each", crew: ["Jo", "Sam", "Dev", "Maya"], replied: 4, invited: 6 },
  ],
  going: [
    { id: "movie", category: "hangout", host: "Sam", title: "Movie marathon", when: "Sun, 12:30 PM", place: "Sam's place", cost: "Free", crew: ["Sam", "Jo", "Leo", "Maya"], who: "4 others are in" },
  ],
  groups: [
    { id: "g2", category: "Games", color: "yellow", title: "Board game cafe night", when: "Today, 7:30 PM", place: "Dice & Dough Cafe", countdown: "In 3 hrs", members: ["Maya", "Jo", "Priya"], status: "ok", last: "Maya: I'll bring Catan. Look for the corner table.", unread: 2, vote: "1 vote open: pick a game" },
    { id: "g10", category: "Outdoors", color: "green", title: "Sunday morning hike", when: "Sun, 9:00 AM", place: "Ridgeview Trailhead", countdown: "In 17 hrs", members: ["Ana", "Leo", "Sam", "Zoe"], status: "wait", last: "Ana: Wear shoes you can get muddy.", unread: 0, vote: "" },
    { id: "g4", category: "Food & drink", color: "orange", title: "Dumpling cook-along", when: "Sun, 4:00 PM", place: "Eastside Community Kitchen", countdown: "Tomorrow", members: ["Priya", "Sam"], status: "form", last: "Priya: Welcome Chris! Two more and we start.", unread: 1, vote: "" },
  ],
  past: [
    { id: "p1", title: "Sunset walk by the lake", initial: "S", sub: "Last Saturday · 4 went", color: "green", people: ["Ana", "Leo", "Mia"] },
    { id: "p2", title: "Open mic night", initial: "O", sub: "2 weeks ago · 6 went", color: "purple", people: ["Lee", "Zoe", "Jo"] },
  ],
};
