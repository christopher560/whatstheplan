import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccentColor } from "@/types.ts";
import { inviteIcons, inviteOptions } from "@/data/invite.ts";
import type { Invite, InviteKind, Rsvp } from "@/data/invite.ts";
import { budgetLabels } from "@/lib/plans-db.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";

type Json = {
  plan: {
    id: string;
    slug: string;
    kind: "hangout" | "casual" | "event" | "formal" | "school";
    title: string;
    description: string;
    place: string;
    when: string;
    budget: number;
  };
  host: { name: string; color: string | null } | null;
  invited: number;
  going: { name: string; color: string | null; mine: boolean }[];
  updates: { text: string; at: string }[];
  me: {
    name: string;
    color: string | null;
    reply: Rsvp | null;
    comfort: number | null;
    plusOne: string | null;
    host: boolean;
  } | null;
};

/** A typical spend for each budget step, used to judge a guest's comfortable spend. */
const perPerson = [0, 10, 25, 50];

const kinds: Record<
  Json["plan"]["kind"],
  { kind: InviteKind; label: string; color: AccentColor; icon: string; steps: Invite["steps"] }
> = {
  hangout: { kind: "hangout", label: "Hangout", color: "yellow", icon: inviteIcons.people, steps: ["reply", "name", "budget", "done"] },
  casual: { kind: "hangout", label: "Casual meetup", color: "green", icon: inviteIcons.people, steps: ["reply", "name", "budget", "done"] },
  event: { kind: "hangout", label: "Event", color: "blue", icon: inviteIcons.calendar, steps: ["reply", "name", "budget", "done"] },
  formal: { kind: "formal", label: "Formal", color: "purple", icon: inviteIcons.star, steps: ["reply", "name", "guests", "done"] },
  school: { kind: "school", label: "School", color: "blue", icon: inviteIcons.cap, steps: ["reply", "name", "done"] },
};

const replyChoices = (kind: InviteKind): Invite["replies"] =>
  kind === "formal"
    ? [
        { id: "in", label: "Joyfully accept", sub: "I will be there." },
        { id: "maybe", label: "Maybe", sub: "I will confirm soon." },
        { id: "out", label: "Regretfully decline", sub: "Sending love instead." },
      ]
    : [
        { id: "in", label: "I'm in", sub: "Save me a spot." },
        { id: "maybe", label: "Maybe", sub: "Count me as a maybe." },
        { id: "out", label: "Can't make it", sub: "Next time for sure." },
      ];

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
};

const toInvite = (json: Json, extra: { token?: string; signedIn: boolean }): Invite => {
  const { plan } = json;
  const base = kinds[plan.kind];
  const host = { name: json.host?.name ?? "A friend", color: nearestAccent(json.host?.color) };
  const cost = plan.budget === 0 ? "Free" : `${budgetLabels[plan.budget]} each`;
  const when = plan.when || "Time still to decide";
  const steps = extra.signedIn ? base.steps.filter((step) => step !== "name") : base.steps;
  const budgetIndex = (limit: number | null) => {
    if (limit === null) return undefined;
    const index = inviteOptions.budget.findIndex((option) => Number(option.id) === limit);
    return index === -1 ? undefined : index;
  };

  return {
    slug: plan.slug,
    kind: base.kind,
    label: base.label,
    color: base.color,
    icon: base.icon,
    title: plan.title,
    host,
    details: [
      { icon: inviteIcons.calendar, text: when },
      { icon: inviteIcons.pin, text: plan.place || "Place still to decide" },
      { icon: inviteIcons.money, text: cost },
    ],
    /* The visitor is added by the page when they say yes, so they are left out here. */
    crew: json.going
      .filter((person) => !person.mine)
      .map((person) => ({ name: person.name, color: nearestAccent(person.color) })),
    invited: json.invited,
    note: plan.description || `Let ${host.name} know if you can make it.`,
    steps,
    replyTitle: base.kind === "formal" ? "Will you join us?" : "Are you in?",
    replies: replyChoices(base.kind),
    perPerson: perPerson[plan.budget] ?? 0,
    slots: [],
    winner: { time: when, sub: "" },
    updates: json.updates.map((update) => ({ text: update.text, time: ago(update.at) })),
    planId: plan.id,
    token: extra.token,
    signedIn: extra.signedIn,
    mine: json.me
      ? {
          rsvp: json.me.reply,
          name: json.me.name,
          color: nearestAccent(json.me.color),
          budget: budgetIndex(json.me.comfort),
          plusOne: json.me.plusOne ?? "",
          host: json.me.host,
        }
      : undefined,
  };
};

/** The invite for a slug. The visitor's own reply is included when they are signed in and in the plan. */
export const readInvite = async (
  supabase: SupabaseClient,
  slug: string,
  signedIn: boolean,
): Promise<Invite | null> => {
  const { data } = await supabase.rpc("public_invite", { p_slug: slug });
  return data ? toInvite(data as Json, { signedIn }) : null;
};

/** A guest's own page, found by the secret in their link. */
export const readReceipt = async (supabase: SupabaseClient, token: string): Promise<Invite | null> => {
  const { data } = await supabase.rpc("guest_receipt", { p_token: token });
  return data ? toInvite(data as Json, { token, signedIn: false }) : null;
};
