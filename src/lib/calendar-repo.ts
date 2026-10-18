import * as mock from "@/data/calendar.ts";
import type { CalendarData, Cell } from "@/data/calendar.ts";

/**
 * Everything the calendar page reads and writes. Backed by sample data today.
 * The Supabase version reads `availability` rows for the signed-in person and
 * their friends (RLS only returns friends who share), and writes the person's
 * own rows (see SUPABASE.md).
 */
export interface CalendarRepo {
  getCalendar(): Promise<CalendarData>;
  /** Replaces the person's availability for the week starting `weekStart`. */
  saveAvailability(weekStart: string, cells: Record<string, Cell>): Promise<void>;
  /** Turns calendar sharing with friends on or off. */
  saveShare(share: boolean): Promise<void>;
}

const startOfWeek = (date: Date) => {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  return copy;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const mockRepo: CalendarRepo = {
  async getCalendar() {
    const now = new Date();
    const weekStart = iso(startOfWeek(now));
    return {
      weekStart,
      today: iso(now),
      cells: mock.sampleCells(),
      friends: mock.sampleFriends(),
      who: ["maya", "dev"],
      share: true,
      plans: mock.samplePlans(weekStart),
    };
  },
  async saveAvailability() {},
  async saveShare() {},
};

export const calendarRepo: CalendarRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const saveAvailability = (weekStart: string, cells: Record<string, Cell>) =>
  calendarRepo.saveAvailability(weekStart, cells);
export const saveShare = (share: boolean) => calendarRepo.saveShare(share);
