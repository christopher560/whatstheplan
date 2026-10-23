import type { AccentColor } from "@/types.ts";

/** Stable ids, never the labels (labels can change; see SUPABASE.md). */
export type GroupCategoryId =
  | "outdoors"
  | "games"
  | "food"
  | "create"
  | "active"
  | "chill";

export interface GroupCategory {
  id: GroupCategoryId;
  label: string;
  /** Second line on the quiz tile. */
  hint: string;
  color: AccentColor;
  /** 24 x 24 stroke path for the quiz tile. */
  icon: string;
}

export const groupCategories: GroupCategory[] = [
  { id: "outdoors", label: "Outdoors", hint: "Fresh air", color: "green", icon: "M3 20l6-10 4 6 3-4 5 8z" },
  {
    id: "games",
    label: "Games",
    hint: "Play something",
    color: "yellow",
    icon: "M6 9h12a3 3 0 013 3v3a3 3 0 01-5 2l-1-2H9l-1 2a3 3 0 01-5-2v-3a3 3 0 013-3zM8 11v4M6 13h4",
  },
  {
    id: "food",
    label: "Food & drink",
    hint: "Eat or cook",
    color: "orange",
    icon: "M6 3v8a2 2 0 002 2v8M10 3v6a2 2 0 01-2 2M17 3c-2 2-2 6 0 8v10",
  },
  { id: "create", label: "Create", hint: "Make something", color: "pink", icon: "M4 20l4-1 11-11-3-3L5 16z" },
  { id: "active", label: "Active", hint: "Move around", color: "blue", icon: "M5 19l4-8 4 4 6-9M15 6h4v4" },
  { id: "chill", label: "Chill & talk", hint: "Just hang out", color: "purple", icon: "M4 5h16v11H9l-5 4z" },
];

export type WhenId = "now" | "tonight" | "weekend" | "week";
export type SizeId = "any" | "cozy" | "small" | "big";

export interface QuizOption<Id extends string> {
  id: Id;
  label: string;
  hint: string;
  icon: string;
}

const star = "M12 3l2 6 6 .5-4.5 4 1.5 6.5L12 16l-5 4 1.5-6.5L4 9.5 10 9z";

export const whenOptions: QuizOption<WhenId>[] = [
  { id: "now", label: "Right now", hint: "Starting in the next 3 hours", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2" },
  { id: "tonight", label: "Tonight", hint: "Later today", icon: "M20 14a8 8 0 11-10-10 6 6 0 0010 10z" },
  { id: "weekend", label: "This weekend", hint: "Today or tomorrow", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { id: "week", label: "Anytime this week", hint: "Soonest good fit", icon: star },
];

export const sizeOptions: QuizOption<SizeId>[] = [
  { id: "cozy", label: "Cozy", hint: "3 to 4 people", icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5" },
  { id: "small", label: "Small", hint: "5 to 6 people", icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 3-5 6-5s6 2 6 5M17 11a2.5 2.5 0 100-5M21 19c0-2-1.5-3.5-3.5-4" },
  { id: "big", label: "Bigger", hint: "7 to 10 people", icon: star },
  { id: "any", label: "Surprise me", hint: "Whatever fits best", icon: star },
];

/** Size filters for the feed, same ids as the quiz. */
export const sizeFilters: { id: SizeId; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "cozy", label: "Up to 4" },
  { id: "small", label: "5 to 6" },
  { id: "big", label: "7 to 10" },
];

export const quizQuestions = [
  { title: "What do you feel like?", hint: "Pick one or two. We use your profile for the rest." },
  { title: "When do you want to do it?", hint: "Closer means sooner. We only show groups that still have room." },
  { title: "How big a group feels good?", hint: "Smaller groups are easier to talk in." },
];

export const findingSteps = [
  "Reading your profile and picks",
  "Finding people who fit this activity",
  "Scoring shared interests and free time",
  "Putting a group together",
  "Checking it has a comfortable size and room for you",
];

export const safetyPoints: { color: AccentColor; icon: string; text: string }[] = [
  { color: "green", icon: "M5 21V8l7-5 7 5v13M9 21v-6h6v6", text: "Always in public places" },
  { color: "blue", icon: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4", text: "18 and over only" },
  { color: "yellow", icon: "M4 5h16v11H9l-5 4V5z", text: "You see the group before you join" },
  { color: "purple", icon: "M15 5l-7 7 7 7", text: "Leave, block or report anytime" },
];

/** A person already in an open group. No photos, just an initial on a color. */
export interface DiscoverMember {
  /** Primary key of the `profiles` row. */
  id: string;
  name: string;
  color: AccentColor;
  likes: string[];
}

/** How well a group suits the viewer. From the database for real groups (see `discover_matches`). */
export interface GroupFit {
  /** 0 to 100: the score the feed is ranked by. */
  you: number;
  /** 0 to 100: how well the viewer suits the people already in it. */
  them: number;
  mutual: number;
  sharedTags: string[];
  /** Members who share an interest with the viewer. */
  overlap: number;
  /** Members who are the viewer's friends. */
  friends?: number;
  /** One person away from having enough to happen. */
  nearly?: boolean;
}

/** One open group anyone nearby can join. Maps to `meetup_groups`. */
export interface OpenGroup {
  /** Primary key of the `meetup_groups` row. */
  id: string;
  title: string;
  category: GroupCategoryId;
  /** Interest labels, matched against the viewer's profile interests. */
  tags: string[];
  purpose: string;
  /** 0 is today, 6 is six days out. */
  day: number;
  /** Start and end as hours on a 24 hour clock (18.5 is 6:30 PM). */
  start: number;
  end: number;
  place: string;
  /** Miles from the viewer's area. */
  distance: number;
  capacity: number;
  /** Member ids, host first. */
  memberIds: string[];
  /** Id of the member who greets newcomers. */
  hostId: string;
  /** The host greets people who are new to the group. */
  newcomerFriendly: boolean;
  /** Set when the score comes from the database. */
  fit?: GroupFit;
  /** The viewer is already in it. */
  joined?: boolean;
}

export interface DiscoverDay {
  /** Short label, "Today" for the first. */
  name: string;
  /** Day of the month. */
  num: number;
  /** Full weekday for screen readers and the page header. */
  weekday: string;
}

/** A public place where a host could start a group. */
export interface HostPlace {
  id: string;
  name: string;
  kind: string;
  town: string;
  /** Miles from the viewer's town. */
  miles: number;
}

export interface DiscoverData {
  area: string;
  /** Groups scoring under this are hidden. */
  minScore?: number;
  /** Ids of the groups the viewer is already in. */
  joined?: string[];
  /** Public places near the viewer, for starting a group. */
  places?: HostPlace[];
  /** Prototype clock. The Supabase version sends the real time in the viewer's zone. */
  clock: { weekday: string; time: string; hour: number };
  viewer: { initial: string; color: AccentColor; interests: string[] };
  days: DiscoverDay[];
  /** Busy blocks on the viewer's calendar for each of the next seven days. */
  busy: [number, number][][];
  members: DiscoverMember[];
  groups: OpenGroup[];
}

export const sampleDiscover: DiscoverData = {
  area: "Lakeview",
  clock: { weekday: "Saturday", time: "4:30 PM", hour: 16.5 },
  viewer: { initial: "C", color: "green", interests: ["Board games", "Outdoors", "Music", "Cooking"] },
  days: [
    { name: "Today", num: 17, weekday: "Saturday" },
    { name: "Sun", num: 18, weekday: "Sunday" },
    { name: "Mon", num: 19, weekday: "Monday" },
    { name: "Tue", num: 20, weekday: "Tuesday" },
    { name: "Wed", num: 21, weekday: "Wednesday" },
    { name: "Thu", num: 22, weekday: "Thursday" },
    { name: "Fri", num: 23, weekday: "Friday" },
  ],
  busy: [[[10, 12]], [[10, 14]], [[9, 17]], [[9, 17], [18.5, 19.5]], [[9, 17]], [[9, 17]], [[9, 18]]],
  members: [
    { id: "maya", name: "Maya", color: "pink", likes: ["Board games", "Music", "Study"] },
    { id: "jo", name: "Jo", color: "purple", likes: ["Music", "Gaming", "Outdoors"] },
    { id: "priya", name: "Priya", color: "yellow", likes: ["Cooking", "Art", "Board games"] },
    { id: "leo", name: "Leo", color: "blue", likes: ["Outdoors", "Sports", "Gaming"] },
    { id: "ana", name: "Ana", color: "green", likes: ["Outdoors", "Art", "Books"] },
    { id: "sam", name: "Sam", color: "orange", likes: ["Cooking", "Outdoors", "Sports"] },
    { id: "zoe", name: "Zoe", color: "red", likes: ["Music", "Gaming", "Art"] },
    { id: "ravi", name: "Ravi", color: "yellow", likes: ["Study", "Sports", "Music"] },
    { id: "nina", name: "Nina", color: "blue", likes: ["Art", "Music", "Books"] },
    { id: "theo", name: "Theo", color: "green", likes: ["Sports", "Gaming", "Outdoors"] },
  ],
  groups: [
    { id: "g9", title: "Coffee and chat for newcomers", category: "chill", tags: ["Music", "Books"], purpose: "Low-key first hello. Come as you are, leave when you want.", day: 0, start: 17.5, end: 19, place: "Brick Lane Coffee", distance: 2.2, capacity: 4, memberIds: ["nina", "theo"], hostId: "nina", newcomerFriendly: true },
    { id: "g1", title: "Sunset walk by the lake", category: "outdoors", tags: ["Outdoors"], purpose: "Easy 4 km loop, then hot chocolate. No experience needed.", day: 0, start: 18.5, end: 20, place: "Lakeview Path, north gate", distance: 1.4, capacity: 8, memberIds: ["leo", "ana", "sam"], hostId: "leo", newcomerFriendly: true },
    { id: "g2", title: "Board game cafe night", category: "games", tags: ["Board games"], purpose: "We teach you the games. Play a few rounds and get to know each other.", day: 0, start: 19.5, end: 22, place: "Dice & Dough Cafe", distance: 0.8, capacity: 6, memberIds: ["maya", "jo", "priya"], hostId: "maya", newcomerFriendly: true },
    { id: "g10", title: "Sunday morning hike", category: "outdoors", tags: ["Outdoors"], purpose: "A steady 2 hour trail walk with a coffee stop at the end.", day: 1, start: 9, end: 11.5, place: "Ridgeview Trailhead", distance: 5.2, capacity: 8, memberIds: ["ana", "leo", "sam", "zoe"], hostId: "ana", newcomerFriendly: true },
    { id: "g3", title: "Pickup volleyball", category: "active", tags: ["Sports", "Outdoors"], purpose: "Casual rotating games. All levels, no pressure to be good.", day: 1, start: 11, end: 13, place: "Eastside Park courts", distance: 4.8, capacity: 10, memberIds: ["theo", "leo", "ravi", "zoe", "sam"], hostId: "theo", newcomerFriendly: false },
    { id: "g4", title: "Dumpling cook-along", category: "food", tags: ["Cooking"], purpose: "Fold, steam, and eat together. Ingredients are covered.", day: 1, start: 16, end: 18.5, place: "Eastside Community Kitchen", distance: 3.6, capacity: 6, memberIds: ["priya", "sam"], hostId: "priya", newcomerFriendly: true },
    { id: "g6", title: "Sketch and sip", category: "create", tags: ["Art"], purpose: "Draw whatever you like next to people doing the same.", day: 2, start: 14, end: 16, place: "Riverside Library patio", distance: 4.1, capacity: 6, memberIds: ["ana", "nina"], hostId: "ana", newcomerFriendly: true },
    { id: "g7", title: "Study and snack session", category: "chill", tags: ["Study", "Books"], purpose: "Quiet focus blocks with a snack break to chat.", day: 3, start: 18, end: 20, place: "Downtown Library, 2nd floor", distance: 6.8, capacity: 8, memberIds: ["ravi", "maya"], hostId: "ravi", newcomerFriendly: true },
    { id: "g5", title: "Open mic listening circle", category: "chill", tags: ["Music"], purpose: "Listen, clap, maybe play one song. Friendly crowd.", day: 4, start: 20, end: 22, place: "Brick Lane Coffee", distance: 2.2, capacity: 10, memberIds: ["zoe", "ravi", "nina", "theo", "jo"], hostId: "zoe", newcomerFriendly: false },
    { id: "g8", title: "Retro game night", category: "games", tags: ["Gaming"], purpose: "Co-op and party games on a big screen.", day: 6, start: 20, end: 23, place: "Pixel Pub back room", distance: 7.4, capacity: 10, memberIds: ["jo", "leo", "zoe"], hostId: "jo", newcomerFriendly: false },
  ],
};
