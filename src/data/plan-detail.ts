import type { AccentColor } from "@/types.ts";
import { samplePlans, categoryLabel } from "@/data/plans.ts";
import type { PlanCard } from "@/data/plans.ts";

export type Reply = "in" | "maybe" | "out" | null;

export interface PlanFriend {
  id: string;
  name: string;
  color: AccentColor;
  reply: Reply;
  /** Time slot ids this friend can do. */
  votes: string[];
}

export interface PlanSlot {
  id: string;
  label: string;
}

export interface FeedItem {
  who: string;
  /** Friend color; the host uses orange. */
  color: AccentColor;
  text: string;
  detail: string;
  time: string;
}

export interface PlanDetail {
  /** Primary key of the `plans` row. */
  id: string;
  title: string;
  category: string;
  /** 0 idea, 1 voting, 2 locked in. */
  stage: 0 | 1 | 2;
  place: string;
  /** Short link used by the invite page, `whatstheplan.app/p/{slug}`. */
  slug: string;
  description: string;
  /** Cost per person in dollars, and the group's comfort limit. */
  perPerson: number;
  comfort: number;
  friends: PlanFriend[];
  slots: PlanSlot[];
  /** Locked time slot id, or null. */
  lockedSlot: string | null;
  autoNudge: boolean;
  feed: FeedItem[];
  swaps: { label: string; cost: string }[];
}

export const quickUpdates = [
  "Running 10 minutes late",
  "Bring sunscreen and a towel",
  "Check the weather Friday",
  "Small change of plans, details soon",
];

const roster: { id: string; name: string; color: AccentColor }[] = [
  { id: "maya", name: "Maya", color: "red" },
  { id: "dev", name: "Dev", color: "blue" },
  { id: "priya", name: "Priya", color: "pink" },
  { id: "sam", name: "Sam", color: "green" },
  { id: "jo", name: "Jo", color: "yellow" },
];

const slots: PlanSlot[] = [
  { id: "sat11", label: "Sat, Oct 24 · 11 AM" },
  { id: "sun11", label: "Sun, Oct 25 · 11 AM" },
  { id: "sat3", label: "Sat, Oct 24 · 3 PM" },
];

const swaps = [
  { label: "Park picnic", cost: "about $9" },
  { label: "Bike the lakefront", cost: "about $12" },
  { label: "Sunset sit", cost: "free" },
];

const beachDay = (): PlanDetail => ({
  id: "beach-day",
  title: "Beach day",
  category: "Hangout",
  stage: 1,
  place: "The lakefront",
  slug: "hangout-chill-5x9k",
  description:
    "Lakefront, sunscreen and a cooler. Bring a towel and something to throw around. We will grab food after.",
  perPerson: 20,
  comfort: 15,
  friends: [
    { ...roster[0], reply: "in", votes: ["sat11", "sun11"] },
    { ...roster[1], reply: "maybe", votes: ["sun11"] },
    { ...roster[2], reply: "in", votes: ["sat11", "sat3"] },
    { ...roster[3], reply: null, votes: [] },
    { ...roster[4], reply: null, votes: [] },
  ],
  slots,
  lockedSlot: null,
  autoNudge: true,
  feed: [
    { who: "Priya", color: "pink", text: "is in", detail: "Picked Sat 11 AM and Sat 3 PM", time: "12 min ago" },
    { who: "Dev", color: "blue", text: "is a maybe", detail: "Picked Sun 11 AM", time: "1 h ago" },
    { who: "Maya", color: "red", text: "is in", detail: "Picked Sat 11 AM and Sun 11 AM", time: "3 h ago" },
    { who: "You", color: "orange", text: "made the plan and sent the link to 5 friends", detail: "Friends reply without an account", time: "Yesterday" },
  ],
  swaps,
});

/** Sample detail for any plan card; only Beach day has hand-written replies. */
export const sampleDetail = (id: string): PlanDetail | null => {
  if (id === "beach-day") return beachDay();
  const card: PlanCard | undefined = samplePlans.find((plan) => plan.id === id);
  if (!card) return null;
  const friends = roster.slice(0, Math.max(2, Math.min(5, card.invited))).map((friend, index) => ({
    ...friend,
    reply: index < card.replied ? ("in" as const) : null,
    votes: index < card.replied ? ["sat11"] : [],
  }));
  const price = Number(card.cost.replace(/[^0-9]/g, "")) || 0;
  return {
    id: card.id,
    title: card.title,
    category: categoryLabel[card.category],
    stage: card.stage,
    place: card.place,
    slug: card.id,
    description: `${card.title} at ${card.place}. Tell us if you are in and which time works.`,
    perPerson: price,
    comfort: 15,
    friends,
    slots,
    lockedSlot: card.stage === 2 ? "sat11" : null,
    autoNudge: true,
    feed: [
      { who: "You", color: "orange", text: `made the plan and sent the link to ${friends.length} friends`, detail: "Friends reply without an account", time: "Yesterday" },
    ],
    swaps,
  };
};
