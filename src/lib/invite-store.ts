import type { AccentColor } from "@/types.ts";
import { inviteOptions } from "@/data/invite.ts";
import type { Invite, InviteStepId, Rsvp } from "@/data/invite.ts";
import { replyAsGuest } from "@/lib/invite-repo.ts";

/**
 * Shared state for the invite page. Each component subscribes to the part it
 * draws. The invite comes from the JSON `InviteState` renders, and the reply
 * is sent through `invite-repo` when the guest finishes the last step.
 */
export interface InviteReplyState {
  step: number;
  rsvp: Rsvp;
  name: string;
  color: AccentColor;
  slots: string[];
  none: boolean;
  /** Index into `inviteOptions.budget`. */
  budget: number;
  plus: boolean;
  guest: string;
  meal: string;
  diets: string[];
  section: string;
  remind: string[];
  when: string;
  calendar: boolean;
  copied: boolean;
  /** The guest's own link, filled in once the reply is saved. */
  receipt: string;
  /** Why the last save failed, shown on the step before the end. */
  error: string;
  /** A note about times for the host. */
  timeNote: string;
}

let invite: Invite | null = null;
let state: InviteReplyState;
const listeners = new Set<() => void>();

const initial = (source: Invite): InviteReplyState => ({
  step: 0,
  rsvp: source.mine?.rsvp ?? "in",
  name: source.mine?.name ?? "",
  color: source.mine?.color ?? "yellow",
  slots: source.slots.filter((slot) => slot.preset).map((slot) => slot.id),
  none: false,
  budget: source.mine?.budget ?? 1,
  plus: !!source.mine?.plusOne,
  guest: source.mine?.plusOne ?? "",
  meal: source.meals?.[0]?.id ?? "",
  diets: [],
  section: source.sections?.[0]?.id ?? "",
  remind: ["push"],
  when: "day",
  calendar: false,
  copied: false,
  receipt: source.token ? `/r/${source.token}` : "",
  error: "",
  timeNote: "",
});

export const getInvite = (): Invite => {
  if (!invite) {
    const source = document.getElementById("invite-data")?.textContent ?? "{}";
    invite = JSON.parse(source) as Invite;
    state = initial(invite);
    /* Someone who already replied opens on the last step, with their answer in place. */
    if (invite.mine?.rsvp) state = { ...state, step: sequence().length - 1 };
  }
  return invite;
};

export const get = () => {
  getInvite();
  return state;
};

export const update = (patch: Partial<InviteReplyState>) => {
  getInvite();
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void) => {
  getInvite();
  listeners.add(listener);
  listener();
};

/** Starts over, as the prototype's "Start over" does. */
export const reset = () => update({ ...initial(getInvite()) });

/** Steps for the current answer. Declining skips the questions. */
export const sequence = (): InviteStepId[] => {
  const source = getInvite();
  return get().rsvp === "out" ? source.steps.filter((step) => ["reply", "name", "done"].includes(step)) : source.steps;
};

export const stepIndex = () => Math.min(get().step, sequence().length - 1);
export const currentStep = (): InviteStepId => sequence()[stepIndex()];

export const cleanName = () => get().name.trim();

/** Only the name step blocks the way forward. */
export const canContinue = () => currentStep() !== "name" || cleanName().length > 0;

export const budgetLimit = () => Number(inviteOptions.budget[get().budget].id);

/** True when the guest's comfortable spend is under the plan's cost. */
export const belowCost = () => budgetLimit() < getInvite().perPerson;

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

export const toggleSlot = (id: string) =>
  update({ slots: toggle(get().slots, id), none: false });
export const toggleDiet = (id: string) => update({ diets: toggle(get().diets, id) });
export const toggleRemind = (id: string) => update({ remind: toggle(get().remind, id) });

const submit = () => {
  const s = get();
  const source = getInvite();
  update({ error: "" });
  void replyAsGuest(source.slug, {
    rsvp: s.rsvp,
    name: cleanName(),
    color: s.color,
    comfortDollars: source.steps.includes("budget") && s.rsvp !== "out" ? budgetLimit() : undefined,
    plusOne: source.steps.includes("guests") && s.plus && s.rsvp !== "out" ? s.guest.trim() || "Guest" : undefined,
    token: source.token,
    slotIds: source.slots.length ? (s.rsvp === "out" ? [] : s.slots) : undefined,
    timeNote: s.rsvp !== "out" && s.timeNote.trim() ? s.timeNote.trim() : undefined,
  }).then((receipt) => {
    /* If saving failed, go back a step and say why instead of showing a false "You're in". */
    if (!receipt.ok) return update({ error: receipt.error, step: Math.max(0, sequence().length - 2) });
    update({ receipt: receipt.path });
  });
};

export const next = () => {
  if (!canContinue()) return;
  const last = stepIndex() === sequence().length - 2;
  if (last) submit();
  update({ step: stepIndex() + 1 });
};

export const back = () => update({ step: Math.max(0, stepIndex() - 1) });

/** "Change my reply" returns to the first step. */
export const edit = () => update({ step: 0, copied: false });

export const choiceLabel = (list: { id: string; label: string }[] | undefined, id: string) =>
  list?.find((item) => item.id === id)?.label ?? "";

/** The recap on the last step. */
export const summaryRows = (): { label: string; value: string }[] => {
  const s = get();
  const source = getInvite();
  const rows = [
    {
      label: "Your reply",
      value: source.replies.find((reply) => reply.id === s.rsvp)?.label ?? "",
    },
  ];
  if (s.rsvp === "out") return rows;

  if (source.steps.includes("times") && source.slots.length) {
    rows.push({
      label: "Times that work",
      value: s.none
        ? "None of these"
        : s.slots.length
          ? source.slots
              .filter((slot) => s.slots.includes(slot.id))
              .map((slot) => `${slot.day.split(",")[0]} ${slot.time}`)
              .join(", ")
          : "Any time",
    });
  }
  if (source.steps.includes("budget")) {
    rows.push({
      label: "Comfortable spend",
      value: `${inviteOptions.budget[s.budget].label} (only you see this)`,
    });
  }
  if (source.steps.includes("guests")) {
    rows.push({
      label: "Guests",
      value: s.plus ? `You + ${s.guest.trim() || "one guest"}` : "Just you",
    });
  }
  if (source.steps.includes("meal")) {
    const diets = inviteOptions.diets
      .filter((diet) => s.diets.includes(diet.id))
      .map((diet) => diet.label.toLowerCase());
    rows.push({
      label: "Meal",
      value: [choiceLabel(source.meals, s.meal), ...diets].join(", "),
    });
  }
  if (source.steps.includes("class")) {
    rows.push({ label: "Section", value: choiceLabel(source.sections, s.section) });
  }
  if (source.steps.includes("remind")) {
    const channels = inviteOptions.channels
      .filter((channel) => s.remind.includes(channel.id))
      .map((channel) => channel.label.toLowerCase())
      .join(" + ");
    rows.push({
      label: "Reminders",
      value: `${channels || "None"}, ${choiceLabel(inviteOptions.when, s.when).toLowerCase()}`,
    });
  }
  return rows;
};

/** True when the host settled on a time the guest did not pick. */
export const winnerMissed = () => {
  const s = get();
  const slotId = getInvite().winner.slotId;
  return !!slotId && !s.none && s.slots.length > 0 && !s.slots.includes(slotId);
};

/** Headline and sentence for the last step. */
export const doneCopy = (): { title: string; sub: string } => {
  const s = get();
  const source = getInvite();
  const first = cleanName() || "friend";
  const host = source.host.name;
  if (s.rsvp === "in") {
    return {
      title: source.kind === "formal" ? `See you there, ${first}!` : `You're in, ${first}!`,
      sub: `${host} has your reply and everyone going can see you joined.`,
    };
  }
  if (s.rsvp === "maybe") {
    return {
      title: `Got it, ${first}. You are a maybe.`,
      sub: `${host} can see you are a maybe. You can switch to yes any time from this link.`,
    };
  }
  return {
    title: `Thanks for letting ${host} know.`,
    sub: `${host} will see you cannot make it. If plans change, this link still works.`,
  };
};
