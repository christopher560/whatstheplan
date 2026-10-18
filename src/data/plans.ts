import type { AccentColor } from "@/types.ts";
import type { Person } from "@/data/dashboard.ts";

export type PlanCategory = "hangout" | "school" | "formal";

export interface PlanCard {
  /** Primary key of the `plans` row. */
  id: string;
  category: PlanCategory;
  /** 0 idea, 1 voting, 2 locked in. */
  stage: 0 | 1 | 2;
  title: string;
  when: string;
  place: string;
  cost: string;
  people: Person[];
  /** Replies in so far, and how many were asked. */
  replied: number;
  invited: number;
  who: string;
  /** The button shown on the card. */
  action: string;
  /** The button label once the action is done. */
  doneLabel: string;
  /** Set when the plan needs the viewer's answer. */
  need?: { due: string; label: string };
  idea?: boolean;
}

export const categoryColor: Record<PlanCategory, AccentColor> = {
  hangout: "yellow",
  school: "blue",
  formal: "purple",
};

export const categoryLabel: Record<PlanCategory, string> = {
  hangout: "Hangout",
  school: "School",
  formal: "Formal",
};

export const stages = [
  { label: "Ideas", color: "pink", hint: "Just sparks. Tap to turn one into a real plan." },
  { label: "Voting", color: "yellow", hint: "Waiting on replies before it locks." },
  { label: "Locked in", color: "green", hint: "Everyone knows when and where." },
] satisfies { label: string; color: AccentColor; hint: string }[];

const crew = (letters: string): Person[] => {
  const colors: Record<string, AccentColor> = {
    M: "red",
    D: "blue",
    J: "yellow",
    S: "green",
    P: "pink",
    L: "purple",
  };
  return letters.split("").map((initial) => ({ initial, color: colors[initial] }));
};

export const samplePlans: PlanCard[] = [
  {
    id: "taco-night", category: "hangout", stage: 2, title: "Taco night",
    when: "Fri, 7:00 PM", place: "Dev's kitchen", cost: "$14 each",
    people: crew("MDJSP"), replied: 5, invited: 5, who: "5 of 5 are in",
    action: "Split the bill", doneLabel: "Bill split sent",
  },
  {
    id: "bio-study", category: "school", stage: 2, title: "Bio 201 study group",
    when: "Thu, 4:00 PM", place: "Library, 3rd floor", cost: "Free",
    people: crew("PSL"), replied: 6, invited: 6, who: "6 classmates in",
    action: "Add to calendar", doneLabel: "Added to calendar",
  },
  {
    id: "beach-day", category: "hangout", stage: 1, title: "Beach day",
    when: "Sat or Sun, deciding by Fri", place: "The lakefront", cost: "~$20 each",
    people: crew("MDP"), replied: 3, invited: 5, who: "3 of 5 have replied",
    action: "Pick your days", doneLabel: "Days picked",
    need: { due: "Deciding by Friday", label: "Pick days" },
  },
  {
    id: "birthday-dinner", category: "formal", stage: 1, title: "Maya's birthday dinner",
    when: "Sat, Oct 24, 7:30 PM", place: "Maya's pick, smart casual", cost: "$30 each",
    people: crew("MPLS"), replied: 6, invited: 9, who: "6 of 9 have replied",
    action: "Reply to invite", doneLabel: "Replied: in",
    need: { due: "Reply by October 20", label: "Reply" },
  },
  {
    id: "trivia-crew", category: "hangout", stage: 1, title: "Trivia crew",
    when: "Wed, 8:00 PM", place: "Place still to pick", cost: "$5 each",
    people: crew("JSDM"), replied: 4, invited: 6, who: "4 of 6 are in",
    action: "Share invite link", doneLabel: "Link copied",
  },
  {
    id: "ramen", category: "hangout", stage: 0, title: "Ramen??",
    when: "No date yet", place: "From your idea stash", cost: "~$16 each",
    people: crew("D"), replied: 1, invited: 5, who: "1 vote so far",
    action: "Turn into a plan", doneLabel: "Nudged", idea: true,
  },
  {
    id: "thrift-crawl", category: "hangout", stage: 0, title: "Thrift crawl",
    when: "No date yet", place: "Idea from Priya", cost: "~$10 each",
    people: crew("PLS"), replied: 2, invited: 5, who: "2 votes so far",
    action: "Turn into a plan", doneLabel: "Nudged", idea: true,
  },
  {
    id: "flashcard-picnic", category: "school", stage: 0, title: "Flashcard picnic",
    when: "No date yet", place: "The quad", cost: "Free",
    people: crew("PS"), replied: 2, invited: 6, who: "2 votes so far",
    action: "Turn into a plan", doneLabel: "Nudged", idea: true,
  },
];
