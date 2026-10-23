import { actions } from "astro:actions";
import type { PlanDetail } from "@/data/plan-detail.ts";
import type { GroupDetail } from "@/data/group.ts";
import type { DiscoverData } from "@/data/discover.ts";

/** Each returns the latest data, or null when it cannot (signed out, no longer there). */
export const liveBadges = async () => {
  const { data } = await actions.live.badges();
  return data ?? null;
};

export const livePlan = async (planId: string): Promise<PlanDetail | null> => {
  const { data } = await actions.live.plan({ planId });
  return (data?.plan as PlanDetail | null | undefined) ?? null;
};

export const liveGroup = async (groupId: string): Promise<GroupDetail | null> => {
  const { data } = await actions.live.group({ groupId });
  return (data?.group as GroupDetail | null | undefined) ?? null;
};

export const liveDiscover = async (): Promise<DiscoverData | null> => {
  const { data } = await actions.live.discover();
  return (data?.data as DiscoverData | null | undefined) ?? null;
};

export const livePlans = async () => {
  const { data } = await actions.live.plans();
  return data ?? null;
};

/** A tiny fingerprint of what a page shows; null if the person cannot see it. */
export const livePulse = async (kind: "plan" | "group" | "discover" | "plans" | "chat", id?: string) => {
  const { data } = await actions.live.pulse({ kind, id });
  return data?.pulse ?? null;
};
