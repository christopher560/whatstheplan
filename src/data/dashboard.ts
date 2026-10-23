import type { AccentColor } from "@/types.ts";

export interface Person {
  initial: string;
  color: AccentColor;
}

export interface Plan {
  /** Primary key of the `plans` row. */
  id: string;
  category: "hangout" | "school" | "formal";
  tag: string;
  title: string;
  sub: string;
  color: AccentColor;
  /** 2 (smallest) to 6 (largest): how close the plan is to locked in. */
  rank: 2 | 3 | 4 | 5 | 6;
  shape: 1 | 2 | 3 | 4;
  /** 0 idea, 1 voting, 2 locked in. */
  stage: 0 | 1 | 2;
  idea?: boolean;
  who: string;
  when: string;
  place: string;
  cost: string;
  action: string;
  people: Person[];
  /** Where "action" goes. */
  href?: string;
}

export type Invite =
  | {
      /** Primary key of the `plan_members` row the invite answers. */
      id: string;
      kind: "rsvp";
      tint: "yellow";
      tag: string;
      title: string;
      details: string[];
    }
  | {
      id: string;
      kind: "group";
      tint: "blue";
      tag: string;
      title: string;
      details: string[];
      people: Person[];
      note: string;
      action: string;
    }
  | {
      id: string;
      kind: "formal";
      title: string;
      details: string[];
      deadline: string;
    };

export const user = { name: "Chris" };

export interface NavItem {
  id: "home" | "discover" | "calendar" | "plans" | "friends";
  label: string;
  href: string;
  /** Names the count in `ShellData.badges` shown on this item. */
  badge?: "plans" | "friends";
}

export const navItems: NavItem[] = [
  { id: "home", label: "Home", href: "/app/dashboard" },
  { id: "discover", label: "Discover", href: "/app/discover" },
  { id: "calendar", label: "Calendar", href: "/app/calendar" },
  { id: "plans", label: "Plans", href: "/app/plans", badge: "plans" },
  { id: "friends", label: "Friends", href: "/app/friends", badge: "friends" },
];

export const viewer = {
  name: "Chris",
  color: "green" as AccentColor,
  friendCount: 6,
};

export const freeNow = {
  people: [
    { initial: "M", color: "red" },
    { initial: "D", color: "blue" },
    { initial: "P", color: "pink" },
  ] satisfies Person[],
  summary: "Maya, Dev and Priya are free tonight. 3 plans cooking.",
};

export const plans: Plan[] = [
  {
    id: "taco-night",
    category: "hangout",
    tag: "Locked in",
    title: "Taco night",
    sub: "$14 each",
    color: "green",
    rank: 6,
    shape: 4,
    stage: 2,
    who: "5 of 5 are in",
    when: "Fri, 7:00 PM",
    place: "Dev's kitchen",
    cost: "$14",
    action: "Split the bill",
    people: [
      { initial: "M", color: "red" },
      { initial: "D", color: "blue" },
      { initial: "J", color: "yellow" },
      { initial: "S", color: "green" },
      { initial: "P", color: "pink" },
    ],
  },
  {
    id: "beach-day",
    category: "hangout",
    tag: "Voting",
    title: "Beach day",
    sub: "3 of 5 · ~$20",
    color: "yellow",
    rank: 5,
    shape: 1,
    stage: 1,
    who: "3 of 5 have replied",
    when: "Sat or Sun, deciding by Fri",
    place: "The lakefront",
    cost: "$20",
    action: "Nudge Jo and Sam",
    people: [
      { initial: "M", color: "red" },
      { initial: "D", color: "blue" },
      { initial: "P", color: "pink" },
    ],
  },
  {
    id: "birthday-dinner",
    category: "formal",
    tag: "Formal",
    title: "Maya's birthday dinner",
    sub: "$30 each",
    color: "purple",
    rank: 5,
    shape: 2,
    stage: 1,
    who: "6 of 9 have replied",
    when: "Sat, Oct 24, 7:30 PM",
    place: "Maya's pick, smart casual",
    cost: "$30",
    action: "Reply to invite",
    people: [
      { initial: "M", color: "red" },
      { initial: "P", color: "pink" },
      { initial: "L", color: "purple" },
      { initial: "S", color: "green" },
    ],
  },
  {
    id: "bio-study",
    category: "school",
    tag: "School",
    title: "Bio 201 study",
    sub: "Free",
    color: "blue",
    rank: 4,
    shape: 3,
    stage: 2,
    who: "6 classmates in",
    when: "Thu, 4:00 PM",
    place: "Library, 3rd floor",
    cost: "Free",
    action: "Open the group",
    people: [
      { initial: "P", color: "pink" },
      { initial: "S", color: "green" },
      { initial: "L", color: "purple" },
    ],
  },
  {
    id: "trivia-crew",
    category: "hangout",
    tag: "Needs 2",
    title: "Trivia crew",
    sub: "$5 each",
    color: "red",
    rank: 3,
    shape: 1,
    stage: 1,
    who: "4 of 6 are in",
    when: "Wed, 8:00 PM",
    place: "Place still to pick",
    cost: "$5",
    action: "Share invite link",
    people: [
      { initial: "J", color: "yellow" },
      { initial: "S", color: "green" },
      { initial: "D", color: "blue" },
      { initial: "M", color: "red" },
    ],
  },
  {
    id: "ramen",
    category: "hangout",
    tag: "Idea",
    title: "Ramen??",
    sub: "~$16 each",
    color: "pink",
    rank: 2,
    shape: 2,
    stage: 0,
    idea: true,
    who: "1 vote so far",
    when: "No date yet",
    place: "From your idea stash",
    cost: "$16",
    action: "Turn into a plan",
    people: [{ initial: "D", color: "blue" }],
  },
];

export const invites: Invite[] = [
  {
    id: "invite-board-games",
    kind: "rsvp",
    tint: "yellow",
    tag: "Hangout",
    title: "Dev wants a board game night",
    details: ["Sat, 8:00 PM · Dev's place", "About $6 each"],
  },
  {
    id: "invite-bio-study",
    kind: "group",
    tint: "blue",
    tag: "School",
    title: "Bio 201 study group",
    details: ["Thu, 4:00 PM · Library, 3rd floor", "Free"],
    people: [
      { initial: "P", color: "pink" },
      { initial: "S", color: "green" },
      { initial: "L", color: "yellow" },
    ],
    note: "6 classmates in",
    action: "Join",
  },
  {
    id: "invite-birthday",
    kind: "formal",
    title: "Maya's Birthday Dinner",
    details: [
      "Saturday, October 24 · 7:30 PM",
      "Dress: smart casual · about $30 each",
    ],
    deadline: "Please reply by October 20",
  },
];

export const budget = {
  month: "October",
  total: 120,
  spent: 74,
  planned: 34,
  plannedLabel: "Planned (Taco night, Beach day)",
  comfort: 15,
};

export const tonight = [
  { name: "Maya", note: "Free after 6", color: "red" },
  { name: "Dev", note: "Free all night", color: "blue" },
  { name: "Priya", note: "Maybe, after dinner", color: "pink" },
] satisfies { name: string; note: string; color: AccentColor }[];

/** Mornings, afternoons and evenings across Monday to Sunday. */
export const overlap = [
  {
    id: "maya",
    name: "Maya",
    best: "Saturday evening looks best.",
    grid: [
      [0, 0, 1, 0, 0, 1, 1],
      [0, 1, 0, 0, 1, 1, 1],
      [1, 0, 0, 1, 1, 1, 0],
    ],
  },
  {
    id: "dev",
    name: "Dev",
    best: "Sunday evening looks best.",
    grid: [
      [0, 0, 0, 0, 0, 1, 0],
      [1, 0, 0, 1, 0, 1, 0],
      [0, 0, 1, 0, 1, 1, 1],
    ],
  },
  {
    id: "jo",
    name: "Jo",
    best: "Friday evening looks best.",
    grid: [
      [1, 0, 1, 0, 0, 0, 1],
      [0, 0, 0, 0, 0, 1, 1],
      [0, 1, 0, 0, 1, 0, 0],
    ],
  },
];
