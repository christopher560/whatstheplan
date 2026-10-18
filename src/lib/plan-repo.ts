import { samplePlans } from "@/data/plans.ts";
import { sampleDetail } from "@/data/plan-detail.ts";
import type { PlanDetail } from "@/data/plan-detail.ts";

/**
 * Everything one plan's replies page reads and writes. Backed by sample data
 * today. The Supabase version reads `plans`, `plan_members`, `plan_slots`,
 * `slot_votes` and `plan_events`, and subscribes to them with Realtime so
 * replies arrive live (see SUPABASE.md).
 */
export interface PlanRepo {
  getPlan(id: string): Promise<PlanDetail | null>;
  /** Ids of every plan, for static page generation. */
  listPlanIds(): Promise<string[]>;
  nudge(planId: string, friendIds: string[]): Promise<void>;
  setAutoNudge(planId: string, on: boolean): Promise<void>;
  /** Locks a time, or unlocks with `null`. Locking notifies everyone going. */
  lockTime(planId: string, slotId: string | null): Promise<void>;
  saveDescription(planId: string, description: string): Promise<void>;
  sendUpdate(planId: string, message: string): Promise<void>;
}

const mockRepo: PlanRepo = {
  async getPlan(id) {
    return sampleDetail(id);
  },
  async listPlanIds() {
    return samplePlans.map((plan) => plan.id);
  },
  async nudge() {},
  async setAutoNudge() {},
  async lockTime() {},
  async saveDescription() {},
  async sendUpdate() {},
};

export const planRepo: PlanRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const nudge = (planId: string, friendIds: string[]) =>
  planRepo.nudge(planId, friendIds);
export const setAutoNudge = (planId: string, on: boolean) =>
  planRepo.setAutoNudge(planId, on);
export const lockTime = (planId: string, slotId: string | null) =>
  planRepo.lockTime(planId, slotId);
export const saveDescription = (planId: string, description: string) =>
  planRepo.saveDescription(planId, description);
export const sendUpdate = (planId: string, message: string) =>
  planRepo.sendUpdate(planId, message);
