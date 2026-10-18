import type { Profile } from "@/lib/onboarding-repo.ts";

export type PasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Everything the account page reads and writes. Backed by sample data today.
 * The Supabase version reads and updates the signed-in person's `profiles`
 * row, calls `auth.updateUser` for the password, and deletes the auth user and
 * cascades their rows (see SUPABASE.md).
 */
export interface AccountRepo {
  getProfile(): Promise<Profile>;
  updateProfile(profile: Profile): Promise<void>;
  changePassword(input: { current: string; next: string }): Promise<PasswordResult>;
  deleteAccount(): Promise<void>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockRepo: AccountRepo = {
  async getProfile() {
    return {
      first_name: "Chris",
      avatar_color: "#52DDB0",
      age_group: "18-24",
      area_id: "aurora-il",
      interests: ["board-games", "outdoors", "music", "cooking"],
      style: { energy: 3, pace: 3, planning: 4, warmup: 2 },
      activity_types: ["game-nights", "walks", "movie-nights"],
      availability: ["weeknights", "weekends"],
      group_size: "small",
      group_first: true,
      discoverable_by: "communities",
      contactable_by: "verified",
      show_area: true,
      guidelines_accepted: true,
    };
  },
  async updateProfile() {
    await wait(500);
  },
  async changePassword() {
    await wait(500);
    return { ok: true };
  },
  async deleteAccount() {
    await wait(500);
  },
};

export const accountRepo: AccountRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const updateProfile = (profile: Profile) => accountRepo.updateProfile(profile);
export const changePassword = (input: { current: string; next: string }) =>
  accountRepo.changePassword(input);
export const deleteAccount = () => accountRepo.deleteAccount();
