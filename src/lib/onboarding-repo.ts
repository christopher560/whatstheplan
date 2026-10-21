import { actions } from "astro:actions";
import * as mock from "@/data/onboarding.ts";
import type { Area } from "@/data/onboarding.ts";

/**
 * One `profiles` row. Field names are the column names, and every choice is a
 * stable id (never a display label), so the object can be upserted as it is.
 * Arrays map to `text[]` columns and `area_id` is a foreign key to `areas`.
 */
export interface Profile {
  first_name: string;
  avatar_color: string;
  age_group: string | null;
  area_id: string | null;
  interests: string[];
  style: {
    energy: number | null;
    pace: number | null;
    planning: number | null;
    warmup: number | null;
  };
  activity_types: string[];
  availability: string[];
  group_size: string;
  group_first: boolean;
  discoverable_by: string;
  contactable_by: string;
  show_area: boolean;
  guidelines_accepted: boolean;
}

/** What gets written: the profile plus where the person is in setup. */
export interface ProfileSave {
  profile: Profile;
  /** Zero-based step reached, so setup can resume where it stopped. */
  onboarding_step: number;
  /** True once the last step is finished. */
  onboarded: boolean;
}

export interface OnboardingRepo {
  /** Places near the signed-in person, nearest first. */
  getAreas(): Promise<Area[]>;
  /** Upserts the signed-in person's `profiles` row. */
  saveProfile(save: ProfileSave): Promise<void>;
}

/**
 * Backed by sample data today. The Supabase version reads `areas` ordered by
 * distance from the person's approximate location (PostGIS `ST_Distance`) and
 * upserts `profiles` through an Astro Action (see SUPABASE.md).
 */
const mockRepo: OnboardingRepo = {
  async getAreas() {
    return mock.areas;
  },
  async saveProfile() {
    await new Promise((resolve) => setTimeout(resolve, 600));
  },
};

export const onboardingRepo: OnboardingRepo = mockRepo;

/**
 * The browser calls this after every step. The answers and how far setup got are
 * saved to `profiles` through an Astro Action, which checks the rules again. It
 * throws when the save fails so the page can say so.
 */
export const saveProfile = async (save: ProfileSave) => {
  const { error } = await actions.onboarding.save({
    profile: save.profile,
    onboarding_step: save.onboarding_step,
    onboarded: save.onboarded,
  });
  if (error) throw error;
};
