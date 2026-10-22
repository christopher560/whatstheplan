import type { AccentColor } from "@/types.ts";

/** Icon paths on a 24 x 24 grid, shared by the invite components. */
export const inviteIcons = {
  check: "M5 12l5 5 9-10",
  maybe: "M9 9a3 3 0 115 2c-1 1-2 1.5-2 3M12 18h.01",
  out: "M6 6l12 12M18 6L6 18",
  people: "M8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 11a2.5 2.5 0 100-5M22 19c0-2-1.5-3.5-3.5-4",
  star: "M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z",
  cap: "M3 9l9-5 9 5-9 5-9-5zM7 11.5V16c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-4.5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
  money: "M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.8 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3",
  dress: "M8 3l4 2 4-2 5 4-3 3-2-1v11H8V9L6 10 3 7z",
  lock: "M5 11h14v10H5zM8 11V8a4 4 0 018 0v3",
};

export type InviteKind = "hangout" | "formal" | "school";
export type Rsvp = "in" | "maybe" | "out";

/** Every step a guest can see. Each invite lists the ones it uses. */
export type InviteStepId =
  | "reply"
  | "name"
  | "times"
  | "budget"
  | "guests"
  | "meal"
  | "class"
  | "remind"
  | "done";

export const stepLabels: Record<InviteStepId, string> = {
  reply: "Reply",
  name: "Your name",
  times: "Times",
  budget: "Budget",
  guests: "Guests",
  meal: "Meal",
  class: "Section",
  remind: "Reminders",
  done: "Done",
};

export interface InvitePerson {
  name: string;
  color: AccentColor;
}

export interface InviteChoice {
  id: string;
  label: string;
  sub?: string;
}

/** A time the host proposed. `free` counts people already free before the guest. */
export interface InviteSlot {
  id: string;
  day: string;
  time: string;
  /** "Maya's pick", "Most people free", or empty. */
  tag: string;
  free: number;
  who: string;
  /** The guest starts with this time picked. */
  preset?: boolean;
}

/**
 * What a friend sees when they open `/p/{slug}`. Maps to a `plans` row plus its
 * `plan_members` rows. The guest needs no account; their reply is stored with a
 * signed `guest_token` (see SUPABASE.md).
 */
export interface Invite {
  slug: string;
  kind: InviteKind;
  /** Short kind label on the tag. */
  label: string;
  color: AccentColor;
  icon: string;
  title: string;
  host: InvitePerson;
  details: { icon: string; text: string }[];
  /** People already in, host first. */
  crew: InvitePerson[];
  /** Everyone invited, for the "x of y" counts. */
  invited: number;
  note: string;
  steps: InviteStepId[];
  replyTitle: string;
  replies: { id: Rsvp; label: string; sub: string }[];
  /** Dollars per person, used to judge the budget answer. */
  perPerson: number;
  slots: InviteSlot[];
  meals?: InviteChoice[];
  sections?: InviteChoice[];
  dressCode?: string;
  /** Short name of the class or group, used in copy. */
  groupWord?: string;
  /** The time the host settled on, shown on the guest's own link once they reply. */
  winner: { time: string; sub: string; slotId?: string };
  /** What the host posted since sending the link, newest first. Maps to `plan_events`. */
  updates: { text: string; time: string }[];
  /** The `plans` row, for real invites. */
  planId?: string;
  /** The secret from the guest's own link, set on `/r/{token}`. */
  token?: string;
  /** True when a signed-in person is looking, so their reply goes to their account. */
  signedIn?: boolean;
  /** The visitor's stored reply, so the page can open on it. */
  mine?: {
    rsvp: Rsvp | null;
    name: string;
    color: AccentColor;
    /** Index into `inviteOptions.budget`. */
    budget?: number;
    plusOne: string;
    host: boolean;
  };
}

export interface InviteOptions {
  budget: InviteChoice[];
  diets: InviteChoice[];
  channels: InviteChoice[];
  when: InviteChoice[];
}

/** Answers every invite offers. Stable ids, labels can be reworded. */
export const inviteOptions: InviteOptions = {
  budget: [
    { id: "0", label: "Free only" },
    { id: "15", label: "Up to $15" },
    { id: "30", label: "Up to $30" },
    { id: "50", label: "$50 and up" },
  ],
  diets: [
    { id: "gf", label: "Gluten-free" },
    { id: "nut", label: "Nut allergy" },
    { id: "dairy", label: "Dairy-free" },
    { id: "halal", label: "Halal" },
  ],
  channels: [
    { id: "push", label: "Notification" },
    { id: "text", label: "Text" },
    { id: "email", label: "Email" },
  ],
  when: [
    { id: "day", label: "1 day before" },
    { id: "hour", label: "1 hour before" },
    { id: "both", label: "Both" },
  ],
};

/** The avatar colors a guest can pick. */
export const guestColors: AccentColor[] = [
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "blue",
  "green",
];

const invites: Record<string, Omit<Invite, "slug">> = {
  "taco-night": {
    kind: "hangout",
    label: "Hangout",
    color: "yellow",
    icon: inviteIcons.people,
    title: "Taco night",
    host: { name: "Maya", color: "red" },
    details: [
      { icon: inviteIcons.calendar, text: "Fri, Oct 23 at 7:00 PM" },
      { icon: inviteIcons.pin, text: "Dev's kitchen" },
      { icon: inviteIcons.money, text: "About $14 each" },
    ],
    crew: [
      { name: "Maya", color: "red" },
      { name: "Dev", color: "blue" },
      { name: "Sam", color: "green" },
      { name: "Priya", color: "pink" },
    ],
    invited: 6,
    note: "Come hungry. I will handle the tacos, you bring a drink if you like.",
    steps: ["reply", "name", "times", "budget", "done"],
    replyTitle: "Are you in?",
    replies: [
      { id: "in", label: "I'm in", sub: "Save me a seat." },
      { id: "maybe", label: "Maybe", sub: "Count me as a maybe." },
      { id: "out", label: "Can't make it", sub: "Next time for sure." },
    ],
    perPerson: 14,
    slots: [
      { id: "fri", day: "Fri, Oct 23", time: "7:00 PM", tag: "Maya's pick", free: 4, who: "Dev, Sam and Priya are free", preset: true },
      { id: "sat", day: "Sat, Oct 24", time: "6:00 PM", tag: "", free: 3, who: "Dev and Priya are free" },
      { id: "sun", day: "Sun, Oct 25", time: "5:00 PM", tag: "Most people free", free: 5, who: "Everyone but Sam is free" },
    ],
    winner: { time: "Fri, Oct 23 · 7:00 PM", sub: "4 of 5 could make it", slotId: "fri" },
    updates: [
      { text: "Locked in Fri 7 PM. Thanks for voting!", time: "1 h ago" },
      { text: "It's at Dev's. Park on Elm St.", time: "3 h ago" },
      { text: "Tacos are on me, bring a drink.", time: "Yesterday" },
    ],
  },
  "maya-birthday": {
    kind: "formal",
    label: "Formal",
    color: "purple",
    icon: inviteIcons.star,
    title: "Maya's birthday dinner",
    host: { name: "Maya", color: "red" },
    details: [
      { icon: inviteIcons.calendar, text: "Sat, Oct 24 at 7:30 PM" },
      { icon: inviteIcons.pin, text: "The Copper Table, 120 W Grove St" },
      { icon: inviteIcons.dress, text: "Smart casual" },
      { icon: inviteIcons.money, text: "About $30 each" },
    ],
    crew: [
      { name: "Maya", color: "red" },
      { name: "Priya", color: "pink" },
      { name: "Leo", color: "purple" },
      { name: "Sam", color: "green" },
      { name: "Jo", color: "yellow" },
    ],
    invited: 9,
    note: "Please reply by October 20 so I can confirm the table. Cannot wait to celebrate with you.",
    steps: ["reply", "name", "guests", "meal", "done"],
    replyTitle: "Will you join us?",
    replies: [
      { id: "in", label: "Joyfully accept", sub: "I will be there." },
      { id: "maybe", label: "Maybe", sub: "I will confirm by Oct 20." },
      { id: "out", label: "Regretfully decline", sub: "Sending love instead." },
    ],
    perPerson: 30,
    slots: [],
    meals: [
      { id: "chicken", label: "Herb roasted chicken" },
      { id: "fish", label: "Seared salmon" },
      { id: "veg", label: "Mushroom risotto (vegetarian)" },
      { id: "vegan", label: "Roasted squash (vegan)" },
    ],
    dressCode: "Dress code: smart casual.",
    winner: { time: "Sat, Oct 24 · 7:30 PM", sub: "Table booked for 12 guests" },
    updates: [
      { text: "The Copper Table confirmed our table.", time: "2 h ago" },
      { text: "Dress code is smart casual.", time: "Yesterday" },
      { text: "Please reply by Oct 20.", time: "2 days ago" },
    ],
  },
  "bio-study": {
    kind: "school",
    label: "School",
    color: "blue",
    icon: inviteIcons.cap,
    title: "Bio 201 study group",
    host: { name: "Priya", color: "pink" },
    details: [
      { icon: inviteIcons.calendar, text: "Thu, Oct 22 at 4:00 PM" },
      { icon: inviteIcons.pin, text: "Library, 3rd floor" },
      { icon: inviteIcons.money, text: "Free" },
    ],
    crew: [
      { name: "Priya", color: "pink" },
      { name: "Sam", color: "green" },
      { name: "Leo", color: "purple" },
    ],
    invited: 6,
    note: "Bring your lecture notes. We are covering chapters 6 and 7 before the quiz.",
    steps: ["reply", "name", "class", "remind", "done"],
    replyTitle: "Are you in?",
    replies: [
      { id: "in", label: "I'll be there", sub: "Notes in hand." },
      { id: "maybe", label: "Maybe", sub: "Depends on my shift." },
      { id: "out", label: "Can't make it", sub: "Send me the notes later." },
    ],
    perPerson: 0,
    slots: [],
    sections: [
      { id: "a", label: "Section A", sub: "Tue and Thu" },
      { id: "b", label: "Section B", sub: "Mon and Wed" },
      { id: "c", label: "Section C", sub: "Fri" },
      { id: "g", label: "Just visiting", sub: "Not in Bio 201" },
    ],
    groupWord: "Bio 201",
    winner: { time: "Thu, Oct 22 · 4:00 PM", sub: "Everyone voted for this slot" },
    updates: [
      { text: "Moved to room B, 3rd floor.", time: "1 h ago" },
      { text: "Quiz covers chapters 6 and 7.", time: "Yesterday" },
      { text: "Bring your lecture notes.", time: "2 days ago" },
    ],
  },
};

/**
 * Other links the app already hands out (the plan builder's preview and the
 * hosted plans) point at the closest sample, so no link on the site is dead.
 */
const aliases: Record<string, string> = {
  preview: "taco-night",
  "beach-day": "taco-night",
  "hangout-chill-5x9k": "taco-night",
  "trivia-crew": "taco-night",
};

export const inviteSlugs = [...Object.keys(invites), ...Object.keys(aliases)];

export const sampleInvite = (slug: string): Invite | null => {
  const source = invites[slug] ?? invites[aliases[slug]];
  return source ? { slug, ...source } : null;
};
