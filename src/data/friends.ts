import type { AccentColor } from "@/types.ts";

/** How free a friend is tonight. */
export type FriendTone = "free" | "maybe" | "busy" | "away";

/** How many weeks ahead the heatmap can open (this week plus seven). */
export const MAX_FRIEND_WEEK = 7;

export interface Friend {
  /** Primary key of the friend's `profiles` row. */
  id: string;
  name: string;
  color: AccentColor;
  tone: FriendTone;
  /** "Free after 6" */
  status: string;
  /** "Free tonight after 6." */
  nextFree: string;
  /** "3 plans together" */
  shared: string;
  /** Free (1) or not (0) for each day, Monday first, one list per week ahead. */
  weeks: number[][];
  /** Labels the viewer gave this friend. Private to the viewer. */
  tags: string[];
}

export interface FriendRequest extends Friend {
  /** Why they are asking: "In your Bio 201 group". */
  note: string;
}

export interface FriendsData {
  friends: Friend[];
  requests: FriendRequest[];
  /** Friend ids in the inner circle, at most `MAX_CIRCLE`. */
  circle: string[];
  /** Friend ids marked as favorites. */
  favorites: string[];
  /** First day of this week, as `YYYY-MM-DD` (a Monday). */
  weekStart: string;
  /** Weekday the prototype treats as today, Monday being 0. */
  todayIndex: number;
  viewer: { initial: string; color: AccentColor };
  /** The link the viewer sends so someone can add them. */
  addLink: string;
}

/** A group holds at most this many friends. */
export const MAX_CIRCLE = 6;

export const tagSuggestions = ["Swim", "Bio", "Roommate", "Family", "Work", "Gym"];

export const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];
export const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Later weeks drift from this week's pattern. The real data has one row per week. */
const driftWeeks = (id: string, base: number[]) =>
  Array.from({ length: MAX_FRIEND_WEEK + 1 }, (_, week) =>
    week === 0
      ? base
      : base.map((value, day) =>
          (id.charCodeAt(0) * (week + 3) + day * 7 + week * 5) % 4 === 0 ? 1 - value : value,
        ),
  );

const friend = (
  f: Omit<Friend, "weeks"> & { week: number[] },
): Friend => ({ ...f, weeks: driftWeeks(f.id, f.week) });

export const sampleFriends: FriendsData = {
  friends: [
    friend({ id: "maya", name: "Maya", color: "red", tone: "free", status: "Free after 6", nextFree: "Free tonight after 6.", shared: "3 plans together", week: [0, 1, 0, 1, 1, 1, 1], tags: ["Taco crew", "Maya's dinner"] }),
    friend({ id: "dev", name: "Dev", color: "blue", tone: "free", status: "Free all night", nextFree: "Free tonight, all night.", shared: "2 plans together", week: [1, 0, 0, 1, 0, 1, 0], tags: ["Taco crew"] }),
    friend({ id: "priya", name: "Priya", color: "pink", tone: "maybe", status: "Maybe tonight", nextFree: "Maybe after dinner tonight.", shared: "4 plans together", week: [0, 0, 1, 1, 1, 1, 1], tags: ["Taco crew", "Bio 201", "Maya's dinner"] }),
    friend({ id: "jo", name: "Jo", color: "yellow", tone: "busy", status: "Busy tonight", nextFree: "Next free: Friday evening.", shared: "2 plans together", week: [1, 0, 1, 0, 1, 0, 0], tags: ["Taco crew", "Swim"] }),
    friend({ id: "sam", name: "Sam", color: "green", tone: "busy", status: "Busy tonight", nextFree: "Next free: Saturday afternoon.", shared: "3 plans together", week: [0, 1, 0, 0, 0, 1, 0], tags: ["Taco crew", "Bio 201", "Maya's dinner", "Swim"] }),
    friend({ id: "leo", name: "Leo", color: "purple", tone: "away", status: "Away until Sunday", nextFree: "Next free: Sunday evening.", shared: "2 plans together", week: [0, 0, 0, 0, 0, 0, 1], tags: ["Bio 201", "Maya's dinner"] }),
  ],
  requests: [
    { ...friend({ id: "alex", name: "Alex", color: "orange", tone: "free", status: "Free tonight", nextFree: "Free tonight, all night.", shared: "New friend", week: [1, 1, 0, 1, 1, 0, 0], tags: ["Bio 201"] }), note: "In your Bio 201 group" },
    { ...friend({ id: "riley", name: "Riley", color: "blue", tone: "busy", status: "Busy tonight", nextFree: "Next free: Saturday evening.", shared: "New friend", week: [0, 0, 1, 0, 0, 1, 1], tags: ["Maya's dinner"] }), note: "Friend of Maya" },
  ],
  circle: ["maya", "dev"],
  favorites: ["priya"],
  weekStart: "2026-10-12",
  todayIndex: 3,
  viewer: { initial: "C", color: "green" },
  addLink: "whatstheplan.app/add/chris",
};
