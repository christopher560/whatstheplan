import type { Profile } from "@/lib/onboarding-repo.ts";

/** Helpers shared by the forms that edit a `Profile` in the browser. */

export const luminance = (hex: string) => {
  const value = parseInt(hex.slice(1), 16);
  return (
    (0.299 * ((value >> 16) & 255) +
      0.587 * ((value >> 8) & 255) +
      0.114 * (value & 255)) /
    255
  );
};

export const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export const styleReady = (style: Profile["style"]) =>
  Object.values(style).every((value) => value !== null);

/** The social style name and sentence derived from the four answers. */
export const styleResult = (style: Profile["style"]) => {
  if (!styleReady(style)) return null;
  const { energy, pace, planning, warmup } = style;
  const sum = energy! + pace!;
  const name =
    sum <= 5 ? "Cozy Connector" : sum <= 8 ? "Easygoing Explorer" : "Lively Spark";
  const plan =
    planning! <= 2
      ? "likes to plan ahead"
      : planning! >= 4
        ? "goes with the flow"
        : "is flexible about plans";
  const warm =
    warmup! <= 2 ? "warms up slowly" : warmup! >= 4 ? "warms up fast" : "warms up steadily";
  return {
    name,
    line: `You ${plan} and ${warm}. We will match you with people who fit that.`,
  };
};

/** Same checks the server will repeat when it saves the profile. */
export const profileErrors = (profile: Profile) => {
  const errors: string[] = [];
  if (!profile.first_name.trim()) errors.push("Add your first name.");
  if (profile.interests.length < 3) errors.push("Pick at least 3 interests.");
  if (!profile.activity_types.length) errors.push("Pick at least one activity.");
  if (!profile.availability.length) errors.push("Pick when you are free.");
  return errors;
};
