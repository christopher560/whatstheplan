import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccentColor } from "@/types.ts";
import type { Invite, Person, Plan } from "@/data/dashboard.ts";
import { categoryLabel } from "@/data/plans.ts";
import { readCalendar } from "@/lib/availability-db.ts";
import { loadPeople, readFriends } from "@/lib/friends-db.ts";
import { readHub } from "@/lib/plans-db.ts";

export interface HomeView {
  name: string;
  freeNow: { people: Person[]; summary: string };
  plans: Plan[];
  invites: Invite[];
  budget: { month: string; total: number; planned: number; plannedLabel: string };
  tonight: { name: string; note: string; color: AccentColor }[];
  overlap: { id: string; name: string; best: string; grid: number[][] }[];
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const initial = (name: string, color: AccentColor): Person => ({ initial: name.replace(/^@/, "").charAt(0).toUpperCase() || "?", color });

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** Hours of the day that make up the grid's three rows. */
const parts = [
  { name: "morning", hours: [8, 9, 10, 11] },
  { name: "afternoon", hours: [12, 13, 14, 15, 16] },
  { name: "evening", hours: [17, 18, 19, 20, 21, 22, 23] },
];

const monthOf = (iso: string, zone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit" }).format(new Date(iso));

/**
 * What the home page shows for the signed-in person, from their own plans, friends and calendar.
 * Nothing here is sample data: a new account gets empty lists and the page hides what it cannot fill.
 */
export const readHome = async (
  supabase: SupabaseClient,
  userId: string,
  name: string,
  zoneName: string | undefined,
  wallClock: Date,
): Promise<HomeView> => {
  const zone = zoneName || "UTC";
  const [hub, friendsData, people, calendar, profile] = await Promise.all([
    readHub(supabase, userId, zoneName),
    readFriends(supabase, userId, wallClock, ""),
    loadPeople(supabase, wallClock),
    readCalendar(supabase, userId, wallClock),
    supabase.from("profiles").select("monthly_budget").eq("id", userId).maybeSingle(),
  ]);

  /* ---- plans: the ones you host, then the ones you were invited to and have not turned down ---- */
  const unanswered = hub.invites.filter((invite) => !hub.replies[invite.id]);
  const accepted = hub.invites.filter((invite) => hub.replies[invite.id] === "in");
  const color = (category: string, stage?: number): AccentColor =>
    stage === 2 ? "green" : category === "formal" ? "purple" : category === "school" ? "blue" : "yellow";
  const tag = (category: string, stage?: number) =>
    stage === 2 ? "Locked in" : category === "formal" ? "Formal" : category === "school" ? "School" : "Voting";

  const hosted: Plan[] = hub.hosting.map((plan) => {
    const ratio = plan.invited ? plan.replied / plan.invited : 0;
    const stage = plan.stage ?? 1;
    return {
      id: plan.id,
      category: plan.category,
      tag: tag(plan.category, stage),
      title: plan.title,
      sub: plan.invited ? `${plan.replied} of ${plan.invited} · ${plan.cost}` : plan.cost,
      color: color(plan.category, stage),
      rank: stage === 2 ? 6 : ratio >= 0.75 ? 5 : ratio >= 0.5 ? 4 : ratio >= 0.25 ? 3 : 2,
      shape: 1,
      stage,
      who: plan.invited ? `${plan.replied} of ${plan.invited} have replied` : "No one invited yet",
      when: plan.when,
      place: plan.place,
      cost: plan.cost,
      action: "See who replied",
      people: plan.crew.map((person, index) => initial(person, plan.crewColors?.[index] ?? "yellow")),
      href: `/app/plans/${plan.id}`,
    };
  });
  const invited: Plan[] = [...unanswered, ...accepted].map((plan) => {
    const stage = plan.stage ?? 1;
    const answered = !!hub.replies[plan.id];
    return {
      id: plan.id,
      category: plan.category,
      tag: tag(plan.category, stage),
      title: plan.title,
      sub: plan.cost,
      color: color(plan.category, stage),
      rank: stage === 2 ? 6 : answered ? 4 : 3,
      shape: 1,
      stage,
      who: plan.who,
      when: plan.when,
      place: plan.place,
      cost: plan.cost,
      action: answered ? "Open the invite" : "Reply to invite",
      people: plan.crew.map((person, index) => initial(person, plan.crewColors?.[index] ?? "yellow")),
      href: plan.slug ? `/p/${plan.slug}` : "/app/plans",
    };
  });
  const plans = [...hosted, ...invited].slice(0, 8).map((plan, index) => ({ ...plan, shape: ((index % 4) + 1) as 1 | 2 | 3 | 4 }));

  /* ---- invites that still need an answer ---- */
  const invites: Invite[] = unanswered.map((invite) =>
    invite.category === "formal"
      ? {
          id: invite.id,
          kind: "formal" as const,
          title: `${invite.from} invited you: ${invite.title}`,
          details: [`${invite.when} · ${invite.place}`, invite.cost],
          deadline: "Please reply when you can.",
        }
      : {
          id: invite.id,
          kind: "rsvp" as const,
          tint: "yellow" as const,
          tag: categoryLabel[invite.category],
          title: `${invite.from} invited you: ${invite.title}`,
          details: [`${invite.when} · ${invite.place}`, invite.cost],
        },
  );

  /* ---- who is free tonight, from the hours friends share ---- */
  const tonightFriends = friendsData.friends.filter((friend) => friend.tone === "free" || friend.tone === "maybe");
  const tonight = tonightFriends.slice(0, 6).map((friend) => ({ name: friend.name, note: friend.status, color: friend.color }));
  const freeNames = friendsData.friends.filter((friend) => friend.tone === "free").map((friend) => friend.name);
  const cooking = hub.hosting.length + unanswered.length;
  const cookingText = cooking ? ` ${cooking} ${cooking === 1 ? "plan" : "plans"} cooking.` : "";
  const summary = freeNames.length
    ? `${escapeHtml(list(freeNames.slice(0, 3)))} ${freeNames.length === 1 ? "is" : "are"} free tonight.${cookingText}`
    : friendsData.friends.length === 0
      ? `Add friends to see who is free tonight.${cookingText}`
      : `Nobody has shared free time for tonight yet.${cookingText}`;
  const freeNow = {
    people: friendsData.friends.filter((friend) => friend.tone === "free").slice(0, 3).map((friend) => initial(friend.name, friend.color)),
    summary,
  };

  /* ---- when you and each friend are both free this week ---- */
  const mine = calendar.weeks[0] ?? calendar.cells;
  const iAmFree = (day: number, hour: number) => mine[`${day}-${hour}`] === "free";
  const overlap = people.rows
    .filter((row) => row.status === "accepted" && row.shared)
    .map((row) => {
      const theirs = new Set(people.byFriend.get(row.other_id)?.[0] ?? []);
      let best = { hours: 0, day: 0, part: 0 };
      const grid = parts.map((part, partIndex) =>
        dayNames.map((_, day) => {
          const hours = part.hours.filter((hour) => iAmFree(day, hour) && theirs.has(`${day}-${hour}`)).length;
          if (hours > best.hours) best = { hours, day, part: partIndex };
          return hours > 0 ? 1 : 0;
        }),
      );
      return {
        id: row.other_id,
        name: row.first_name || `@${row.username ?? "friend"}`,
        best: best.hours ? `${dayNames[best.day]} ${parts[best.part].name} looks best.` : "No shared free time this week yet.",
        grid,
        windows: grid.flat().filter(Boolean).length,
      };
    })
    .sort((a, b) => b.windows - a.windows)
    .slice(0, 3)
    .map(({ windows: _windows, ...rest }) => rest);

  /* ---- the month's budget: what you set, and what your plans add up to ---- */
  const month = monthOf(new Date().toISOString(), zone);
  const counted = [
    ...hub.hosting.map((plan) => ({ title: plan.title, startsAt: plan.startsAt, amount: plan.amount ?? 0 })),
    ...accepted.map((plan) => ({ title: plan.title, startsAt: plan.startsAt, amount: plan.amount ?? 0 })),
  ].filter((plan) => plan.startsAt && monthOf(plan.startsAt, zone) === month && plan.amount > 0);
  const planned = counted.reduce((sum, plan) => sum + plan.amount, 0);
  const budget = {
    month: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: zone }).format(new Date()),
    total: (profile.data?.monthly_budget as number | null | undefined) ?? 100,
    planned,
    plannedLabel: counted.length ? `Planned (${counted.slice(0, 2).map((plan) => plan.title).join(", ")})` : "Planned",
  };

  return { name, freeNow, plans, invites, budget, tonight, overlap };
};
