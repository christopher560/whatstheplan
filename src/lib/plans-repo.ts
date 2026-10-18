import { samplePlansHub } from "@/data/plans-hub.ts";
import type { InviteReply, PlansHub } from "@/data/plans-hub.ts";

/**
 * Everything the plans page reads and writes. Backed by sample data today.
 * The Supabase version reads `plan_members` joined with `plans` for the
 * signed-in person, plus their `meetup_members` groups, and writes the
 * person's answers (see SUPABASE.md).
 */
export interface PlansRepo {
  getHub(): Promise<PlansHub>;
  /** Saves the answer to an invite, or clears it with `null`. */
  answerInvite(inviteId: string, reply: InviteReply | null): Promise<void>;
  /** Puts a plan or group on the person's calendar, or takes it off. */
  setOnCalendar(planId: string, added: boolean): Promise<void>;
  /** Sends or cancels a friend request to someone met in a group. */
  setFriendRequest(personName: string, sent: boolean): Promise<void>;
}

const mockRepo: PlansRepo = {
  async getHub() {
    return samplePlansHub;
  },
  async answerInvite() {},
  async setOnCalendar() {},
  async setFriendRequest() {},
};

export const plansRepo: PlansRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const answerInvite = (inviteId: string, reply: InviteReply | null) =>
  plansRepo.answerInvite(inviteId, reply);
export const setOnCalendar = (planId: string, added: boolean) =>
  plansRepo.setOnCalendar(planId, added);
export const setFriendRequest = (personName: string, sent: boolean) =>
  plansRepo.setFriendRequest(personName, sent);
