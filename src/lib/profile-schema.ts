import { z } from "astro/zod";
import {
  activityTypes,
  ageGroups,
  areas,
  availability,
  contactOptions,
  findOptions,
  groupSizes,
  interests,
  maxInterests,
  minInterests,
  otherArea,
} from "@/data/onboarding.ts";

/**
 * The rules for a profile, used by every action that saves one. They repeat the
 * checks the forms already make in the browser, because the browser can be
 * bypassed: the server never trusts what it is sent. Every choice must be an id
 * from `src/data/onboarding.ts`.
 */
const only = (list: { id: string }[]) => {
  const ids = new Set(list.map((item) => item.id));
  return (value: string) => ids.has(value);
};

const isInterest = only(interests);
const isActivity = only(activityTypes);
const isAvailability = only(availability);
const isArea = only([...areas, otherArea]);

const score = z.number().int().min(1).max(5).nullable();

export const profileSchema = z.object({
  first_name: z.string().trim().max(40),
  avatar_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** `u13` is not accepted: the app is for people 13 and over. */
  age_group: z.enum(ageGroups.map((group) => group.id).filter((id) => id !== "u13") as [string, ...string[]]).nullable(),
  area_id: z.string().max(60).refine(isArea).nullable(),
  interests: z.array(z.string().refine(isInterest)).max(maxInterests),
  style: z.object({ energy: score, pace: score, planning: score, warmup: score }),
  activity_types: z.array(z.string().refine(isActivity)).max(activityTypes.length),
  availability: z.array(z.string().refine(isAvailability)).max(availability.length),
  group_size: z.enum(groupSizes.map((size) => size.id) as [string, ...string[]]),
  group_first: z.boolean(),
  discoverable_by: z.enum(findOptions.map((option) => option.id) as [string, ...string[]]),
  contactable_by: z.enum(contactOptions.map((option) => option.id) as [string, ...string[]]),
  show_area: z.boolean(),
  guidelines_accepted: z.boolean(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/**
 * What a finished profile needs. Returns the first thing missing, or null.
 * `guidelines` is false for the account page, which has no guidelines box: the
 * answer is whatever was given in onboarding.
 */
export const incomplete = (profile: ProfileInput, guidelines = true): string | null => {
  if (!profile.first_name) return "Add your first name.";
  if (!profile.age_group) return "Pick your age group.";
  if (!profile.area_id) return "Pick your area.";
  if (profile.interests.length < minInterests) return `Pick at least ${minInterests} interests.`;
  if (Object.values(profile.style).some((value) => value === null)) return "Answer all four style questions.";
  if (!profile.activity_types.length) return "Pick at least one activity.";
  if (!profile.availability.length) return "Pick when you are free.";
  if (guidelines && !profile.guidelines_accepted) return "Agree to the community guidelines to continue.";
  return null;
};
