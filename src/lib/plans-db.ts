import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccentColor } from "@/types.ts";
import { categoryLabel } from "@/data/plans.ts";
import type { PlanCategory } from "@/data/plans.ts";
import type { HubGoing, HubHosted, HubInvite, InviteReply, PlansHub } from "@/data/plans-hub.ts";
import type { FeedItem, PlanDetail, Reply } from "@/data/plan-detail.ts";
import { nearestAccent } from "@/utils/avatar-accent.ts";

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
  created_at: string;
};

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

const sentence = (plan: PlanRow) => ({
  when: plan.when_text || "Time still to decide",
  place: plan.place || "Place still to decide",
  cost: budgetLabels[plan.budget_tier] ?? "",
});

const loadPlans = async (supabase: SupabaseClient) => {
  const [plans, people] = await Promise.all([
    supabase.from("plans").select("*").order("created_at", { ascending: false }),
    supabase.rpc("my_plan_people"),
  ]);
  const byPlan = new Map<string, PersonRow[]>();
  ((people.data ?? []) as PersonRow[]).forEach((person) => {
    byPlan.set(person.plan_id, [...(byPlan.get(person.plan_id) ?? []), person]);
  });
  return { plans: (plans.data ?? []) as PlanRow[], byPlan };
};

/** Plans the signed-in person hosts or was invited to. */
export const readHub = async (supabase: SupabaseClient, userId: string): Promise<PlansHub> => {
  const { plans, byPlan } = await loadPlans(supabase);
  const hosting: HubHosted[] = [];
  const invites: HubInvite[] = [];
  const replies: Record<string, InviteReply> = {};

  plans.forEach((plan) => {
    const people = byPlan.get(plan.id) ?? [];
    const category = categoryOf(plan.kind);
    const base = { category, title: plan.title, ...sentence(plan) };

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
  return { replies, invites, hosting, going, groups: [], past: [] };
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

  const [people, feed] = await Promise.all([
    supabase.rpc("my_plan_people"),
    supabase.rpc("plan_feed", { p_plan: planId }),
  ]);
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
    comfort: 15,
    friends: members
      .filter((person) => !person.is_host)
      .map((person) => ({
        id: person.member_id,
        name: person.name,
        color: nearestAccent(person.avatar_color),
        reply: person.reply as Reply,
        votes: [],
      })),
    slots: [],
    lockedSlot: null,
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
