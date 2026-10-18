import type { AccentColor } from "@/types.ts";

export const steps = [
  {
    name: "The basics",
    title: "Hi there. First, the basics.",
    lead: "Just enough to match you safely.",
  },
  {
    name: "Your interests",
    title: "What do you love doing?",
    lead: "Pick a few. This is how we find your people.",
  },
  {
    name: "Your style",
    title: "How do you like to hang out?",
    lead: "No right answers. Only you see these.",
  },
  {
    name: "Activities",
    title: "What sounds fun this week?",
    lead: "We will suggest small, low-pressure things.",
  },
  {
    name: "Privacy",
    title: "You stay in control.",
    lead: "Choose who can find you and say hi.",
  },
  {
    name: "All set",
    title: "You're all set.",
    lead: "Here are a few places to start.",
  },
];

export const swatches: { color: AccentColor }[] = [
  { color: "yellow" },
  { color: "orange" },
  { color: "red" },
  { color: "pink" },
  { color: "purple" },
  { color: "blue" },
  { color: "green" },
];

export const ageGroups = [
  { id: "u13", label: "Under 13" },
  { id: "13-15", label: "13 to 15" },
  { id: "16-17", label: "16 to 17" },
  { id: "18-24", label: "18 to 24" },
  { id: "25+", label: "25 and up" },
];

export interface Area {
  /** Primary key of the `areas` row. */
  id: string;
  name: string;
  state: string;
}

/** Nearby places, nearest first. The Supabase version orders them by distance. */
export const areas: Area[] = [
  { id: "aurora-il", name: "Aurora", state: "IL" },
  { id: "oswego-il", name: "Oswego", state: "IL" },
  { id: "montgomery-il", name: "Montgomery", state: "IL" },
  { id: "yorkville-il", name: "Yorkville", state: "IL" },
  { id: "naperville-il", name: "Naperville", state: "IL" },
  { id: "plainfield-il", name: "Plainfield", state: "IL" },
  { id: "batavia-il", name: "Batavia", state: "IL" },
];

/** Shown after the nearby places, for anyone who lives elsewhere. */
export const otherArea = { id: "other", name: "Somewhere else" };

export const interests: {
  id: string;
  name: string;
  color: AccentColor;
}[] = [
  { id: "board-games", name: "Board games", color: "yellow" },
  { id: "outdoors", name: "Outdoors", color: "green" },
  { id: "music", name: "Music", color: "purple" },
  { id: "art", name: "Art", color: "pink" },
  { id: "study", name: "Study", color: "blue" },
  { id: "cooking", name: "Cooking", color: "orange" },
  { id: "gaming", name: "Gaming", color: "red" },
  { id: "books", name: "Books", color: "green" },
  { id: "sports", name: "Sports", color: "yellow" },
  { id: "movies", name: "Movies", color: "purple" },
  { id: "dance", name: "Dance", color: "pink" },
  { id: "volunteering", name: "Volunteering", color: "blue" },
];

export const maxInterests = 8;
export const minInterests = 3;

export const questions = [
  { id: "energy", q: "After a social day, I feel...", lo: "Ready for quiet", hi: "Ready for more" },
  { id: "pace", q: "My ideal pace is...", lo: "Slow and calm", hi: "Busy and lively" },
  { id: "planning", q: "I like plans that are...", lo: "Planned ahead", hi: "Spur of the moment" },
  { id: "warmup", q: "With new people, I warm up...", lo: "Slowly", hi: "Quickly" },
];

export const activityTypes = [
  { id: "game-nights", label: "Game nights" },
  { id: "picnics", label: "Picnics" },
  { id: "study-sessions", label: "Study sessions" },
  { id: "walks", label: "Walks" },
  { id: "cook-alongs", label: "Cook-alongs" },
  { id: "open-mics", label: "Open mics" },
  { id: "sketching", label: "Sketching" },
  { id: "movie-nights", label: "Movie nights" },
];

export const availability = [
  { id: "weeknights", label: "Weeknights" },
  { id: "weekends", label: "Weekends" },
  { id: "afternoons", label: "Afternoons" },
  { id: "mornings", label: "Mornings" },
];

export const groupSizes = [
  { id: "one_on_one", label: "Just 1 or 2", sub: "A close hang" },
  { id: "small", label: "Small group", sub: "3 to 5 people" },
  { id: "medium", label: "Medium group", sub: "6 to 10 people" },
];

export const findOptions = [
  { id: "communities", label: "People in my communities", sub: "The safest option. Recommended." },
  { id: "friends", label: "Communities and friends of friends", sub: "A little wider." },
  { id: "nobody", label: "Only people I invite", sub: "You stay hidden from search." },
];

export const contactOptions = [
  { id: "verified", label: "Verified people in my age group", sub: "They can send a preset hello." },
  { id: "accepted", label: "Only people I accept", sub: "You approve every hello first." },
];

/** Pages worth visiting first. `icon` names a file in `src/assets/icons`. */
export const recommendedPages = [
  {
    href: "/app/discover",
    icon: "discover",
    color: "blue",
    title: "Discover",
    sub: "Find people and places that match your interests.",
  },
  {
    href: "/app/friends",
    icon: "friends",
    color: "pink",
    title: "Friends",
    sub: "Add friends and see who is free.",
  },
  {
    href: "/app/plans",
    icon: "plans",
    color: "yellow",
    title: "Plans",
    sub: "Start your first plan in five taps.",
  },
] satisfies {
  href: string;
  icon: "discover" | "friends" | "plans" | "calendar";
  color: AccentColor;
  title: string;
  sub: string;
}[];
