import { actions } from "astro:actions";
import type { Rsvp } from "@/data/invite.ts";

/** What a guest sends back. Only the fields their invite asked for are set. */
export interface GuestReply {
  rsvp: Rsvp;
  name: string;
  /** Accent color id for the avatar. */
  color: string;
  /** Highest comfortable spend in dollars. Private to the guest. */
  comfortDollars?: number;
  plusOne?: string;
  /** The secret from the guest's own link, when they are changing a reply they already gave. */
  token?: string;
  /** The proposed times this person can do. */
  slotIds?: string[];
  /** A short note about times, for the host. */
  timeNote?: string;
}

export type GuestReceipt = { ok: true; path: string } | { ok: false; error: string };

const failed = { ok: false as const, error: "Something went wrong. Please try again." };

/**
 * The public invite page reads on the server (`src/lib/invite-db.ts`) and sends
 * replies here. A guest gets back the path of their own link; a signed-in person
 * is sent to their Plans.
 */
export const replyAsGuest = async (slug: string, reply: GuestReply): Promise<GuestReceipt> => {
  const { data, error } = await actions.invite.reply({
    slug,
    rsvp: reply.rsvp,
    name: reply.name,
    color: reply.color as "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink",
    comfortDollars: reply.comfortDollars,
    plusOne: reply.plusOne,
    token: reply.token,
    slotIds: reply.slotIds,
    timeNote: reply.timeNote,
  });
  return error || !data ? failed : data;
};


/** Asks the plan's host to be friends. The status is the same one the Friends page gets. */
export const addHost = async (slug: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> => {
  const { data, error } = await actions.inviteAccount.addHost({ slug });
  return error || !data ? failed : data;
};

/** Attaches a guest's reply to the signed-in account. Gives back the plan's slug. */
export const claimReply = async (token: string): Promise<{ ok: true; slug: string } | { ok: false; error: string }> => {
  const { data, error } = await actions.inviteAccount.claimReply({ token });
  return error || !data ? failed : data;
};
