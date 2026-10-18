import { inviteSlugs, sampleInvite } from "@/data/invite.ts";
import type { Invite, Rsvp } from "@/data/invite.ts";

/** What a guest sends back. Only the fields their invite asked for are set. */
export interface GuestReply {
  rsvp: Rsvp;
  name: string;
  /** Accent color id for the avatar. */
  color: string;
  slotIds: string[];
  noSlotWorks: boolean;
  /** Highest comfortable spend in dollars. Private to the guest. */
  comfortDollars?: number;
  plusOne?: string;
  meal?: string;
  diets?: string[];
  section?: string;
  remindVia?: string[];
  remindWhen?: string;
}

export interface GuestReceipt {
  /** Path of the guest's own link, where they can change their reply. */
  path: string;
}

/**
 * Everything the public invite page reads and writes. Backed by sample data
 * today. The Supabase version reads the `plans` row for the slug, and
 * `replyAsGuest` inserts a `plan_members` row with a null `user_id` and a
 * signed `guest_token`, returning the token's link (see SUPABASE.md).
 */
export interface InviteRepo {
  getInvite(slug: string): Promise<Invite | null>;
  /** Slugs to prerender. Drop this once the page renders on request. */
  listSlugs(): Promise<string[]>;
  replyAsGuest(slug: string, reply: GuestReply): Promise<GuestReceipt>;
}

const mockRepo: InviteRepo = {
  async getInvite(slug) {
    return sampleInvite(slug);
  },
  async listSlugs() {
    return inviteSlugs;
  },
  async replyAsGuest(slug, reply) {
    const person = reply.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "guest";
    return { path: `/r/${slug.slice(0, 4)}-${person}` };
  },
};

export const inviteRepo: InviteRepo = mockRepo;

/** The browser calls this; swap its body for an Astro Action call later. */
export const replyAsGuest = (slug: string, reply: GuestReply) =>
  inviteRepo.replyAsGuest(slug, reply);
