import * as mock from "@/data/dashboard.ts";
import type { AccentColor } from "@/types.ts";
import type { Invite, NavItem, Person, Plan } from "@/data/dashboard.ts";

export interface HomeData {
  user: { name: string };
  freeNow: { people: Person[]; summary: string };
  plans: Plan[];
  invites: Invite[];
  budget: typeof mock.budget;
  tonight: typeof mock.tonight;
  overlap: typeof mock.overlap;
}

/** What every dashboard page needs: navigation, who is signed in, counts. */
export interface ShellData {
  nav: NavItem[];
  viewer: { name: string; color: AccentColor; friendCount: number };
  /** Things waiting on the person: open invites and plans needing an answer. */
  badges: { plans: number };
}

export type Rsvp = "in" | "maybe" | "out";

/**
 * Every read and write the dashboard makes. Pages and components only talk to
 * this interface. Today it is backed by sample data; the Supabase version
 * implements the same methods (see SUPABASE.md), so nothing else changes.
 */
export interface DashboardRepo {
  getShell(): Promise<ShellData>;
  getHome(): Promise<HomeData>;
  setRsvp(inviteId: string, answer: Rsvp): Promise<void>;
  setMonthlyBudget(month: string, total: number): Promise<void>;
  setFreeTonight(free: boolean): Promise<void>;
  createPlan(input: {
    type: string;
    vibe: string;
    budgetTier: number;
    /** Friends with the app. */
    friendIds: string[];
    /** Names of people without the app; they get the link. */
    guestNames: string[];
    title: string;
    description: string;
    place: string;
    /** Suggested time carried over from the calendar, if any. */
    when: string;
  }): Promise<{ id: string; slug: string }>;
}

const mockRepo: DashboardRepo = {
  async getShell() {
    return {
      nav: mock.navItems,
      viewer: mock.viewer,
      badges: { plans: mock.invites.length },
    };
  },
  async getHome() {
    return {
      user: mock.user,
      freeNow: mock.freeNow,
      plans: mock.plans,
      invites: mock.invites,
      budget: mock.budget,
      tonight: mock.tonight,
      overlap: mock.overlap,
    };
  },
  async setRsvp() {},
  async setMonthlyBudget() {},
  async setFreeTonight() {},
  async createPlan() {
    // Returns an existing sample plan so "See replies" resolves in the mock.
    return { id: "beach-day", slug: "mock" };
  },
};

export const dashboardRepo: DashboardRepo = mockRepo;
