import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/onboarding-repo.ts";

/** The `profiles` columns that make up a `Profile`. */
const columns =
  "first_name, avatar_color, age_group, area_id, interests, style, activity_types, availability, group_size, group_first, discoverable_by, contactable_by, show_area, guidelines_accepted";

/** Shown until someone picks their own color. Same as the first swatch. */
export const defaultAvatarColor = "#FFD23F";

/** A signed-in person's saved answers, plus how far setup got. Null if the row is missing. */
export const readProfile = async (supabase: SupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select(`${columns}, onboarded, onboarding_step`)
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;

  const profile: Profile = {
    first_name: data.first_name ?? "",
    avatar_color: data.avatar_color ?? defaultAvatarColor,
    age_group: data.age_group,
    area_id: data.area_id,
    interests: data.interests ?? [],
    style: data.style ?? { energy: null, pace: null, planning: null, warmup: null },
    activity_types: data.activity_types ?? [],
    availability: data.availability ?? [],
    group_size: data.group_size,
    group_first: data.group_first,
    discoverable_by: data.discoverable_by,
    contactable_by: data.contactable_by,
    show_area: data.show_area,
    guidelines_accepted: data.guidelines_accepted,
  };
  return { profile, onboarded: data.onboarded as boolean, step: data.onboarding_step as number };
};

/** The column values to write for a profile. Empty text is stored as null. */
export const profileRow = (profile: Profile) => ({
  ...profile,
  first_name: profile.first_name || null,
});
