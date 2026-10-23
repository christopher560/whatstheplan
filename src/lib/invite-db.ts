import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccentColor } from "@/types.ts";
import { inviteIcons, inviteOptions } from "@/data/invite.ts";
import type { Invite, InviteKind, Rsvp } from "@/data/invite.ts";
import { budgetLabels } from "@/lib/plans-db.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";
import { slotClock, slotDay, slotLabel } from "@/utils/slot-time.ts";

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
    tz: string;
    locked: string | null;
  };
  host: { name: string; color: string | null } | null;
  invited: number;
  going: { name: string; color: string | null; mine: boolean }[];
  slots: { id: string; at: string; pos: number; votes: number; voters: string[]; mine: boolean }[];
  updates: { text: string; at: string }[];
  friend?: "none" | "friends" | "requested";
  pinned?: boolean;
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
  const locked = json.slots.find((slot) => slot.id === plan.locked);
  const pick = json.slots.find((slot) => slot.pos === 0);
  const when = locked
    ? slotLabel(locked.at, plan.tz).replace(" · ", " at ")
    : json.slots.length > 1
      ? `${slotLabel(pick?.at ?? json.slots[0].at, plan.tz).replace(" · ", " at ")}, or nearby`
      : json.slots.length === 1
        ? slotLabel(json.slots[0].at, plan.tz).replace(" · ", " at ")
        : plan.when || "Time still to decide";
  /* Friends vote on times for hangouts, casual meetups and events, so that step is always there.
   * Formal and school plans have it only when the host offered some leeway. */
  const votes = ["hangout", "casual", "event"].includes(plan.kind) || json.slots.length > 1;
  const alreadyReplied = !!json.me?.reply;
  const withTimes = votes
    ? base.steps.flatMap((step) => (step === "name" ? [step, "times" as const] : [step]))
    : base.steps;
  const steps = extra.signedIn ? withTimes.filter((step) => step !== "name") : withTimes;
  const top = Math.max(0, ...json.slots.map((slot) => slot.votes));
  const names = (list: string[]) =>
    list.length === 0
      ? "No votes yet"
      : list.length <= 3
        ? `${list.join(", ").replace(/, ([^,]*)$/, " and $1")} can do it`
        : `${list.slice(0, 2).join(", ")} and ${list.length - 2} more can do it`;
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
    /* A visitor who has not replied yet is not counted by the database, but is one of the people asked. */
    invited: json.invited + (json.me ? 0 : 1),
    note: plan.description || `Let ${host.name} know if you can make it.`,
    steps,
    replyTitle: base.kind === "formal" ? "Will you join us?" : "Are you in?",
    replies: replyChoices(base.kind),
    perPerson: perPerson[plan.budget] ?? 0,
    slots: json.slots.map((slot) => ({
      id: slot.id,
      day: slotDay(slot.at, plan.tz),
      time: slotClock(slot.at, plan.tz),
      tag:
        slot.id === plan.locked
          ? "Locked in"
          : slot.pos === 0
            ? `${host.name}'s pick`
            : slot.votes > 0 && slot.votes === top
              ? "Most votes"
              : "",
      /* The visitor's own vote is added by the page, so it is left out of this count. */
      free: slot.votes - (slot.mine ? 1 : 0),
      who: names(slot.voters),
      /* Someone new starts on the host's pick; someone who already replied keeps their own choices. */
      preset: alreadyReplied ? slot.mine : slot.pos === 0,
    })),
    winner: locked
      ? {
          time: slotLabel(locked.at, plan.tz),
          sub: `${locked.votes} of ${json.invited} could make it`,
          slotId: locked.id,
        }
      : { time: when, sub: "" },
    calendarHref: locked || pick || json.slots[0] ? `/p/${plan.slug}/calendar.ics` : undefined,
    calendarLabel: locked ? "Add to calendar" : "Add to calendar (tentative)",
    friend: extra.signedIn ? (json.friend ?? "none") : undefined,
    claimable: extra.signedIn && !!extra.token,
    pinned: extra.signedIn ? !!json.pinned : undefined,
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
export const readReceipt = async (
  supabase: SupabaseClient,
  token: string,
  signedIn = false,
): Promise<Invite | null> => {
  const { data } = await supabase.rpc("guest_receipt", { p_token: token });
  return data ? toInvite(data as Json, { token, signedIn }) : null;
};
