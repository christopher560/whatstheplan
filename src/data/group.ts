import type { AccentColor } from "@/types.ts";
import { groupCategories, sampleDiscover } from "@/data/discover.ts";
import type { OpenGroup } from "@/data/discover.ts";

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
export type GroupLine =
  | { kind: "system"; text: string }
  | { kind: "message"; id: string; from: string; text: string; time: string };

export interface GroupPollOption {
  id: string;
  label: string;
  /** Ids of members who voted for it. */
  voters: string[];
}

export interface GroupPoll {
  question: string;
  options: GroupPollOption[];
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
  capacity: number;
  /** People needed for it to go ahead. */
  minimum: number;
  /** The other members. The viewer is added by the page. */
  members: GroupMember[];
  poll?: GroupPoll;
  chat: GroupLine[];
  /** The viewer's answer when the page opens. */
  going: boolean | null;
  onCalendar: boolean;
}

const maya: GroupMember = { id: "maya", name: "Maya", color: "pink", note: "Brings Catan", going: true };
const jo: GroupMember = { id: "jo", name: "Jo", color: "purple", note: "New in town", going: true };
const priya: GroupMember = { id: "priya", name: "Priya", color: "yellow", note: "Might be late", going: false };

const groups: Record<string, GroupDetail> = {
  g2: {
    id: "g2",
    title: "Board game cafe night",
    category: "Games",
    color: "yellow",
    short: "Board games",
    what: "Easy games at a cafe. Learners welcome, nobody has to be good.",
    tags: ["Board games", "Cafes", "Beginner friendly"],
    place: "Dice & Dough Cafe",
    address: "218 Maple St · 0.8 mi away",
    when: "Today, 7:30 PM",
    countdown: "In 3 hours",
    capacity: 6,
    minimum: 3,
    members: [maya, jo, priya],
    chat: [
      { kind: "system", text: "You joined the group" },
      { kind: "message", id: "m1", from: "maya", text: "Hey all! I will bring Catan and Codenames.", time: "3:42 PM" },
      { kind: "message", id: "m2", from: "jo", text: "Never played Catan, but I am down to learn.", time: "3:50 PM" },
      { kind: "message", id: "m3", from: "priya", text: "I might be 10 minutes late.", time: "4:05 PM" },
    ],
    going: true,
    onCalendar: true,
  },
  g10: {
    id: "g10",
    title: "Sunday morning hike",
    category: "Outdoors",
    color: "green",
    short: "Easy 5 km hike",
    what: "Relaxed pace, one steady climb. Bring water and shoes with grip.",
    tags: ["Hiking", "Outdoors", "Beginner friendly"],
    place: "Ridgeview Trailhead",
    address: "Ridge Rd, north lot · 4.2 mi away",
    when: "Sun, 9:00 AM",
    countdown: "In 17 hours",
    capacity: 8,
    minimum: 4,
    members: [
      { id: "ana", name: "Ana", color: "green", note: "Hikes most weekends", going: true },
      { id: "leo", name: "Leo", color: "blue", note: "Brings snacks", going: true },
      { id: "sam", name: "Sam", color: "orange", note: "Not replied", going: false },
      { id: "zoe", name: "Zoe", color: "red", note: "Not replied", going: false },
    ],
    poll: {
      question: "Where do we meet?",
      options: [
        { id: "lot", label: "Trailhead lot, 9:00", voters: ["ana", "leo"] },
        { id: "coffee", label: "Coffee stop first, 8:30", voters: ["zoe"] },
      ],
    },
    chat: [
      { kind: "system", text: "You joined the group" },
      { kind: "message", id: "m1", from: "ana", text: "Welcome! The trail is dry, forecast looks clear.", time: "Yesterday" },
      { kind: "message", id: "m2", from: "leo", text: "I can drive 3 people if anyone needs a ride.", time: "Yesterday" },
    ],
    going: null,
    onCalendar: false,
  },
  g4: {
    id: "g4",
    title: "Dumpling cook-along",
    category: "Food & drink",
    color: "orange",
    short: "Dumpling cooking",
    what: "Fold, steam and eat together. All ingredients are provided.",
    tags: ["Cooking", "Food", "Beginner friendly"],
    place: "Eastside Community Kitchen",
    address: "41 Lake Ave · 2.1 mi away",
    when: "Sun, 4:00 PM",
    countdown: "Tomorrow",
    capacity: 6,
    minimum: 4,
    members: [
      { id: "priya", name: "Priya", color: "yellow", note: "Started the group", going: true },
      { id: "sam", name: "Sam", color: "orange", note: "Not replied", going: false },
    ],
    chat: [
      { kind: "system", text: "You joined the group" },
      { kind: "message", id: "m1", from: "priya", text: "Welcome! We need 4 to book the kitchen, so invite a friend if you like.", time: "11:20 AM" },
    ],
    going: null,
    onCalendar: false,
  },
};

const hourText = (hour: number) => {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  const clock = `${whole % 12 || 12}:${String(minutes).padStart(2, "0")}`;
  return `${clock} ${whole >= 12 ? "PM" : "AM"}`;
};

/**
 * A Discover group the viewer can join has no hand-written page, so the page is
 * built from the open group. The Supabase version reads the same row.
 */
const fromOpenGroup = (open: OpenGroup): GroupDetail => {
  const { days, members, clock } = sampleDiscover;
  const category = groupCategories.find((item) => item.id === open.category)!;
  const day = days[open.day];
  const hoursAway = Math.max(1, Math.round(open.start - clock.hour));
  return {
    id: open.id,
    title: open.title,
    category: category.label,
    color: category.color,
    short: open.tags[0] ?? category.label,
    what: open.purpose,
    tags: [...open.tags, ...(open.newcomerFriendly ? ["Beginner friendly"] : [])],
    place: open.place,
    address: `${open.place} · ${open.distance.toFixed(1)} mi away`,
    when: `${open.day === 0 ? "Today" : day.weekday}, ${hourText(open.start)}`,
    countdown: open.day === 0 ? `In ${hoursAway} hours` : open.day === 1 ? "Tomorrow" : `In ${open.day} days`,
    capacity: open.capacity,
    minimum: 3,
    members: open.memberIds.map((id) => {
      const person = members.find((member) => member.id === id)!;
      const hosting = id === open.hostId;
      return {
        id: person.id,
        name: person.name,
        color: person.color,
        note: hosting ? "Hosting" : `Likes ${person.likes[0]}`,
        going: hosting,
      };
    }),
    chat: [
      { kind: "system", text: "You joined the group" },
      {
        kind: "message",
        id: "m1",
        from: open.hostId,
        text: "Welcome! Say hi and tell us what you are into.",
        time: "Earlier",
      },
    ],
    going: null,
    onCalendar: false,
  };
};

export const groupIds = [...new Set([...Object.keys(groups), ...sampleDiscover.groups.map((group) => group.id)])];

export const sampleGroup = (id: string): GroupDetail | null => {
  if (groups[id]) return groups[id];
  const open = sampleDiscover.groups.find((group) => group.id === id);
  return open ? fromOpenGroup(open) : null;
};
