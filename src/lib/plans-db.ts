import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccentColor } from "@/types.ts";
import { categoryLabel } from "@/data/plans.ts";
import type { PlanCategory } from "@/data/plans.ts";
import type { CalendarPlan } from "@/data/calendar.ts";
import type { HubGoing, HubHosted, HubInvite, InviteReply, PlansHub } from "@/data/plans-hub.ts";
import type { FeedItem, PlanDetail, Reply } from "@/data/plan-detail.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";
import { slotLabel } from "@/utils/slot-time.ts";
import { groupCategories } from "@/data/discover.ts";
import type { GroupCategoryId } from "@/data/discover.ts";
import { countdown, safeZone, whenLabel } from "@/lib/group-db.ts";
import type { HubGroup } from "@/data/plans-hub.ts";

type PlanRow = {
  id: string;
  owner_id: string;
  slug: string;
  kind: "hangout" | "casual" | "event" | "formal" | "school";
  budget_tier: number;
  title: string;
  description: string;
  place: string;
  when_text: string;
  stage: 0 | 1 | 2;
  auto_nudge: boolean;
  tz: string;
  locked_slot_id: string | null;
  created_at: string;
};

type PlanFriendState = "guest" | "self" | "friends" | "requested" | "none";

type SlotRow = { id: string; plan_id: string; starts_at: string; position?: number };

type PersonRow = {
  plan_id: string;
  member_id: string;
  user_id: string | null;
  is_host: boolean;
  name: string;
  avatar_color: string | null;
  reply: "in" | "maybe" | "out" | null;
};

type FeedRow = {
  event_id: string;
  member_id: string | null;
  kind: string;
  text: string;
  detail: string;
  created_at: string;
};

/** What each budget step in the plan builder means, per person. */
export const budgetLabels = ["Free", "Under $15", "$15 to $40", "$40 and up"];
/** A typical spend for each step, for the plan page's budget card. */
const budgetAmount = [0, 10, 25, 50];

const categoryOf = (kind: PlanRow["kind"]): PlanCategory =>
  kind === "formal" ? "formal" : kind === "school" ? "school" : "hangout";

/** The time line for a plan: the locked time, how many times are up for a vote, or the host's note. */
const whenOf = (plan: PlanRow, slots: SlotRow[]) => {
  const locked = slots.find((slot) => slot.id === plan.locked_slot_id);
  if (locked) return slotLabel(locked.starts_at, plan.tz).replace(" · ", " at ");
  if (slots.length === 1) return slotLabel(slots[0].starts_at, plan.tz).replace(" · ", " at ");
  if (slots.length) {
    const pick = slots.find((slot) => slot.position === 0) ?? slots[0];
    return `${slotLabel(pick.starts_at, plan.tz).replace(" · ", " at ")}, or nearby`;
  }
  return plan.when_text || "Time still to decide";
};

const sentence = (plan: PlanRow, slots: SlotRow[]) => ({
  when: whenOf(plan, slots),
  place: plan.place || "Place still to decide",
  cost: budgetLabels[plan.budget_tier] ?? "",
});

const loadPlans = async (supabase: SupabaseClient) => {
  const [plans, people, slots, pins] = await Promise.all([
    supabase.from("plans").select("*").order("created_at", { ascending: false }),
    supabase.rpc("my_plan_people"),
    supabase.from("plan_slots").select("id, plan_id, starts_at, position").order("starts_at"),
    supabase.from("calendar_pins").select("plan_id"),
  ]);
  const pinned = new Set((pins.data ?? []).map((row) => row.plan_id as string));
  const slotsByPlan = new Map<string, SlotRow[]>();
  ((slots.data ?? []) as SlotRow[]).forEach((slot) => {
    slotsByPlan.set(slot.plan_id, [...(slotsByPlan.get(slot.plan_id) ?? []), slot]);
  });
  const byPlan = new Map<string, PersonRow[]>();
  ((people.data ?? []) as PersonRow[]).forEach((person) => {
    byPlan.set(person.plan_id, [...(byPlan.get(person.plan_id) ?? []), person]);
  });
  return { plans: (plans.data ?? []) as PlanRow[], byPlan, slotsByPlan, pinned };
};

/** Plans the signed-in person hosts or was invited to. */
export const readHub = async (supabase: SupabaseClient, userId: string, zoneName?: string): Promise<PlansHub> => {
  const [{ plans, byPlan, slotsByPlan, pinned }, mine] = await Promise.all([loadPlans(supabase), supabase.rpc("my_groups")]);
  const hosting: HubHosted[] = [];
  const invites: HubInvite[] = [];
  const replies: Record<string, InviteReply> = {};

  plans.forEach((plan) => {
    const people = byPlan.get(plan.id) ?? [];
    const category = categoryOf(plan.kind);
    const planSlots = slotsByPlan.get(plan.id) ?? [];
    const startSlot = planSlots.find((slot) => slot.id === plan.locked_slot_id) ?? planSlots.find((slot) => slot.position === 0) ?? planSlots[0];
    const base = {
      category,
      title: plan.title,
      stage: plan.stage,
      startsAt: startSlot?.starts_at,
      amount: budgetAmount[plan.budget_tier] ?? 0,
      ...sentence(plan, planSlots),
    };

    if (plan.owner_id === userId) {
      const guests = people.filter((person) => !person.is_host);
      hosting.push({
        ...base,
        id: plan.id,
        slug: plan.slug,
        crew: guests.map((person) => person.name),
        crewColors: guests.map((person) => nearestAccent(person.avatar_color)),
        replied: guests.filter((person) => person.reply).length,
        invited: guests.length,
      });
      return;
    }

    const me = people.find((person) => person.user_id === userId);
    const host = people.find((person) => person.is_host);
    if (!me) return;
    const others = people.filter((person) => person.member_id !== me.member_id);
    invites.push({
      ...base,
      id: me.member_id,
      planId: plan.id,
      pinned: pinned.has(plan.id),
      slug: plan.slug,
      hasTime: (slotsByPlan.get(plan.id) ?? []).length > 0,
      from: host?.name ?? "A friend",
      fromColor: nearestAccent(host?.avatar_color),
      who: `${people.filter((person) => person.reply).length} of ${people.length} have replied`,
      due: "",
      crew: others.map((person) => person.name),
      crewColors: others.map((person) => nearestAccent(person.avatar_color)),
    });
    if (me.reply === "in" || me.reply === "out") replies[me.member_id] = me.reply;
  });

  const going: HubGoing[] = [];

  /* Discover groups the person is in. */
  const zone = safeZone(zoneName);
  const now = new Date();
  const groups: HubGroup[] = ((mine.data ?? []) as {
    id: string;
    title: string;
    category: GroupCategoryId;
    startsAt: string;
    place: string;
    minPeople: number;
    total: number;
    going: number;
    people: { name: string; color: string | null }[];
    vote: string | null;
    last: string | null;
    unread: number;
  }[]).map((group) => {
    const category = groupCategories.find((item) => item.id === group.category)!;
    const status = group.total < group.minPeople ? "form" : group.going >= group.minPeople ? "ok" : "wait";
    const start = new Date(group.startsAt);
    return {
      id: group.id,
      category: category.label,
      color: category.color,
      title: group.title,
      when: whenLabel(start, zone, now),
      place: group.place,
      countdown: countdown(start, now),
      members: group.people.map((person) => person.name),
      memberColors: group.people.map((person) => nearestAccent(person.color)),
      status,
      statusLabel:
        status === "form"
          ? `Forming. Needs ${group.minPeople - group.total} more`
          : status === "wait"
            ? `Needs ${group.minPeople - group.going} more ${group.minPeople - group.going === 1 ? "yes" : "yeses"}`
            : "Confirmed",
      last: group.last ?? "",
      unread: group.unread,
      vote: group.vote ? `Vote: ${group.vote}` : "",
    };
  });
  return { replies, invites, hosting, going, groups, past: [] };
};

/** Invites the signed-in person has not answered, for the sidebar badge. */
export const countPending = async (supabase: SupabaseClient, userId: string) => {
  const { count } = await supabase
    .from("plan_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_host", false)
    .is("reply", null);
  return count ?? 0;
};

const ago = (iso: string, now: Date) => {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
};

/** One plan the person hosts, with each friend's reply and what happened so far. Null if it is not theirs. */
export const readPlan = async (
  supabase: SupabaseClient,
  userId: string,
  planId: string,
): Promise<PlanDetail | null> => {
  const now = new Date();
  const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).eq("owner_id", userId).maybeSingle();
  if (!plan) return null;
  const row = plan as PlanRow;

  const [people, feed, slotRows, voteRows, states, comfortRow] = await Promise.all([
    supabase.rpc("my_plan_people"),
    supabase.rpc("plan_feed", { p_plan: planId }),
    supabase.from("plan_slots").select("id, plan_id, starts_at").eq("plan_id", planId).order("starts_at"),
    supabase.rpc("plan_votes", { p_plan: planId }),
    supabase.rpc("plan_member_friend_states", { p_plan: planId }),
    supabase.rpc("plan_comfort", { p_plan: planId }),
  ]);
  const stateOf = new Map(((states.data ?? []) as { member_id: string; state: PlanFriendState }[]).map((row) => [row.member_id, row.state]));
  const votesBy = new Map<string, string[]>();
  ((voteRows.data ?? []) as { member_id: string; slot_id: string }[]).forEach((vote) => {
    votesBy.set(vote.member_id, [...(votesBy.get(vote.member_id) ?? []), vote.slot_id]);
  });
  const slots = (slotRows.data ?? []) as SlotRow[];
  const members = ((people.data ?? []) as PersonRow[]).filter((person) => person.plan_id === planId);
  const byMember = new Map(members.map((person) => [person.member_id, person]));

  const items: FeedItem[] = ((feed.data ?? []) as FeedRow[]).map((event) => {
    const who = event.member_id ? byMember.get(event.member_id) : undefined;
    const mine = who?.user_id === userId;
    return {
      who: mine ? "You" : (who?.name ?? "Someone"),
      color: mine ? ("orange" as AccentColor) : nearestAccent(who?.avatar_color),
      text: event.text,
      detail: event.detail,
      time: ago(event.created_at, now),
    };
  });

  return {
    id: row.id,
    title: row.title,
    category: categoryLabel[categoryOf(row.kind)],
    stage: row.stage,
    place: row.place || "Place still to decide",
    slug: row.slug,
    description: row.description,
    perPerson: budgetAmount[row.budget_tier] ?? 0,
    comfort: typeof comfortRow.data === "number" ? comfortRow.data : null,
    friends: members
      .filter((person) => !person.is_host)
      .map((person) => ({
        id: person.member_id,
        name: person.name,
        color: nearestAccent(person.avatar_color),
        reply: person.reply as Reply,
        votes: votesBy.get(person.member_id) ?? [],
        friend: stateOf.get(person.member_id),
      })),
    slots: slots.map((slot) => ({ id: slot.id, label: slotLabel(slot.starts_at, row.tz) })),
    lockedSlot: row.locked_slot_id,
    autoNudge: row.auto_nudge,
    feed: items,
    swaps: [],
  };
};

type FriendRow = {
  other_id: string;
  first_name: string | null;
  avatar_color: string | null;
  username: string | null;
  status: "pending" | "accepted";
  favorite: boolean;
  circle_position: number | null;
};

/** Friends the plan builder can invite: favorites and the inner circle first. */
export const readBuilderFriends = async (supabase: SupabaseClient) => {
  const { data } = await supabase.rpc("list_friends");
  return ((data ?? []) as FriendRow[])
    .filter((row) => row.status === "accepted")
    .sort(
      (a, b) =>
        Number(b.circle_position !== null) - Number(a.circle_position !== null) ||
        Number(b.favorite) - Number(a.favorite),
    )
    .map((row) => ({
      id: row.other_id,
      name: row.first_name || `@${row.username ?? "friend"}`,
      color: nearestAccent(row.avatar_color),
    }));
};

/** Hour and date of an instant on someone's own clock. */
const clockIn = (iso: string, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
};

/**
 * Plans with a locked time, for the calendar grid, on the viewer's own clock.
 * Hosting or "in" is a plan they are doing; an invite they have not answered shows
 * as waiting. Plans they said no to stay off the grid.
 */
export const readCalendarPlans = async (
  supabase: SupabaseClient,
  userId: string,
  zone: string,
): Promise<CalendarPlan[]> => {
  const [plans, slots, mine, pins, groups] = await Promise.all([
    supabase.from("plans").select("*"),
    supabase.from("plan_slots").select("id, plan_id, starts_at, position"),
    supabase.from("plan_members").select("plan_id, is_host, reply").eq("user_id", userId),
    supabase.from("calendar_pins").select("plan_id"),
    /* Groups the person is in: the database only lets them read their own. */
    supabase
      .from("meetup_groups")
      .select("id, title, starts_at, ends_at, status, places(name)")
      .neq("status", "cancelled")
      .gt("ends_at", new Date().toISOString()),
  ]);
  const fromGroups: CalendarPlan[] = ((groups.data ?? []) as unknown as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    places: { name: string } | { name: string }[] | null;
  }[]).map((group) => {
    const start = clockIn(group.starts_at, zone);
    const end = clockIn(group.ends_at, zone);
    const from = Math.min(Math.max(start.hour, 8), 22);
    const venue = Array.isArray(group.places) ? group.places[0]?.name : group.places?.name;
    return {
      id: group.id,
      date: start.date,
      from,
      to: end.date === start.date ? Math.min(Math.max(end.hour, from + 1), 24) : 24,
      short: group.title.length > 7 ? `${group.title.slice(0, 6)}.` : group.title,
      title: group.title,
      when: new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: zone }).format(
        new Date(group.starts_at),
      ),
      place: venue ?? "Public place",
      kind: "group" as const,
    };
  });
  const slotsOf = new Map<string, SlotRow[]>();
  ((slots.data ?? []) as SlotRow[]).forEach((slot) => {
    slotsOf.set(slot.plan_id, [...(slotsOf.get(slot.plan_id) ?? []), slot]);
  });
  const memberOf = new Map((mine.data ?? []).map((row) => [row.plan_id as string, row]));
  const pinned = new Set((pins.data ?? []).map((row) => row.plan_id as string));

  const fromPlans = ((plans.data ?? []) as PlanRow[]).flatMap((plan): CalendarPlan[] => {
    const member = memberOf.get(plan.id);
    const options = slotsOf.get(plan.id) ?? [];
    /* The locked time, or the host's pick until one is locked. */
    const slot =
      options.find((item) => item.id === plan.locked_slot_id) ??
      options.find((item) => item.position === 0) ??
      options[0];
    if (!slot || !member) return [];
    /* On the grid: plans they host, plans with a locked time, and anything they added themselves. */
    if (!member.is_host && !plan.locked_slot_id && !pinned.has(plan.id)) return [];
    const kind = member.is_host
      ? "host"
      : member.reply === "in" || member.reply === "maybe"
        ? "going"
        : member.reply === null
          ? "pending"
          : null;
    if (!kind) return [];
    const { date, hour } = clockIn(slot.starts_at, zone);
    const from = Math.min(Math.max(hour, 8), 22);
    return [
      {
        id: plan.id,
        date,
        from,
        to: Math.min(from + 2, 24),
        short: plan.title.length > 7 ? `${plan.title.slice(0, 6)}.` : plan.title,
        title: plan.title,
        when: new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          timeZone: zone,
        }).format(new Date(slot.starts_at)),
        place: plan.place || "Place still to decide",
        kind,
      },
    ];
  });
  return [...fromPlans, ...fromGroups];
};
