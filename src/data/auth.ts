import type { AccentColor } from "@/types.ts";

/** The side panel on the sign-up and log-in pages cycles through these stories. */
export type ShowcaseTint = AccentColor | "white";

export type ShowcaseCard =
  /** A week of availability with the best time ticked. `best` is [day, row]. */
  | { kind: "grid"; best: [number, number]; note: string }
  | { kind: "link"; url: string; people: string; note: string }
  | { kind: "cost"; amount: string; people: string; note: string }
  | { kind: "plan"; chip: string; title: string; line: string; people: string }
  /** Days picked, 0 is Monday. */
  | { kind: "days"; on: number[]; note: string }
  | { kind: "match"; percent: number; chips: string[]; people: string }
  | { kind: "group"; title: string; people: string; percent: number; note: string }
  | { kind: "update"; heading: string; line: string };

export interface ShowcaseStep {
  label: string;
  tint: ShowcaseTint;
  card: ShowcaseCard;
}

export interface Showcase {
  label: string;
  steps: ShowcaseStep[];
}

export const showcaseTitle = "Plans that actually happen.";

/** Avatar color for a one-letter initial. No photos, just an initial on a color. */
export const showcasePeople: Record<string, AccentColor> = {
  M: "red",
  D: "blue",
  S: "green",
  P: "pink",
  L: "purple",
  J: "yellow",
  A: "yellow",
  K: "blue",
  R: "pink",
  T: "green",
  E: "purple",
};

/** How full each cell of the availability grid looks, 0 to 4, row by row. */
export const gridLevels = [0, 1, 2, 1, 2, 1, 3, 1, 0, 1, 2, 1, 2, 2, 2, 1, 2, 1, 3, 3, 1];

export const showcases: Showcase[] = [
  {
    label: "Hang out with friends",
    steps: [
      { label: "Find a time", tint: "white", card: { kind: "grid", best: [5, 2], note: "Saturday evening works for all 5" } },
      { label: "Send one link", tint: "blue", card: { kind: "link", url: "whatstheplan.social/p/tacos", people: "MDSP", note: "4 said yes" } },
      { label: "Split the cost", tint: "orange", card: { kind: "cost", amount: "$15", people: "MDSP", note: "$60 split 4 ways" } },
      { label: "Lock it in", tint: "white", card: { kind: "plan", chip: "Locked in", title: "Taco night", line: "Sat · 7:00 pm · Lupe's Taqueria", people: "MDSP" } },
    ],
  },
  {
    label: "Meet new people",
    steps: [
      { label: "Pick your days", tint: "white", card: { kind: "days", on: [5, 6], note: "Weekend, any time" } },
      { label: "Get matched", tint: "purple", card: { kind: "match", percent: 92, chips: ["Hiking", "Coffee", "Photos"], people: "AKRT" } },
      { label: "Join the group", tint: "green", card: { kind: "group", title: "Sunset hike crew", people: "AKRT", percent: 83, note: "5 of 6 joined" } },
      { label: "Meet up", tint: "white", card: { kind: "plan", chip: "Locked in", title: "Sunset hike", line: "Sun · 5:30 pm · Cedar Ridge", people: "AKRT" } },
    ],
  },
  {
    label: "School",
    steps: [
      { label: "Pick a time", tint: "white", card: { kind: "grid", best: [1, 1], note: "Tuesday afternoon works for all 4" } },
      { label: "Invite classmates", tint: "blue", card: { kind: "link", url: "whatstheplan.social/p/bio201", people: "PSLJ", note: "3 said yes" } },
      { label: "Stay in sync", tint: "yellow", card: { kind: "update", heading: "Update from Priya", line: "Room changed to Library 2B" } },
      { label: "Study time", tint: "white", card: { kind: "plan", chip: "Locked in", title: "Bio 201 study", line: "Tue · 3:30 pm · Library 2B", people: "PSLJ" } },
    ],
  },
  {
    label: "Formal events",
    steps: [
      { label: "Send invites", tint: "blue", card: { kind: "link", url: "whatstheplan.social/p/maya-sam", people: "MDSPL", note: "38 of 50 replied" } },
      { label: "Track RSVPs", tint: "orange", card: { kind: "group", title: "Guest list", people: "MDSPL", percent: 76, note: "38 of 50 are coming" } },
      { label: "Share updates", tint: "purple", card: { kind: "update", heading: "Update from Maya", line: "Ceremony moves to the Garden Hall" } },
      { label: "All set", tint: "white", card: { kind: "plan", chip: "All set", title: "Maya & Sam", line: "Jun 14 · 4:00 pm · Garden Hall", people: "MDSPL" } },
    ],
  },
];

export const weekdayLetters = ["M", "T", "W", "T", "F", "S", "S"];
