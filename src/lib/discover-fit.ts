import type {
  DiscoverData,
  DiscoverMember,
  GroupCategoryId,
  OpenGroup,
  SizeId,
  WhenId,
} from "@/data/discover.ts";

/**
 * How well a group suits the viewer, and the viewer suits it. Pure functions
 * over the sample shapes. The Supabase version computes this in a SQL view
 * (`discover_matches`) so the feed arrives ranked and the client only filters.
 */

/** Groups scoring under this mutual fit are hidden. */
export const MIN_FIT = 60;
/** Hours ahead that count as "starting soon". */
export const SOON_HOURS = 3;

export interface Fit {
  you: number;
  them: number;
  mutual: number;
  sharedTags: string[];
  /** Members who share an interest with the viewer. */
  overlap: number;
}

export interface Answers {
  want: GroupCategoryId[];
  when: WhenId;
  size: SizeId;
  host: boolean;
}

export const memberOf = (data: DiscoverData, id: string): DiscoverMember =>
  data.members.find((member) => member.id === id)!;

/** Hours from now until the group starts. Negative once it has begun. */
export const hoursUntil = (data: DiscoverData, group: OpenGroup) =>
  group.day * 24 + group.start - data.clock.hour;

export const spotsOpen = (group: OpenGroup) => group.capacity - group.memberIds.length;

export const clashes = (data: DiscoverData, group: OpenGroup) =>
  data.busy[group.day].some(([from, to]) => from < group.end && to > group.start);

/** Open to the viewer: room left, someone already in, a sane size, no calendar clash. */
export const eligible = (data: DiscoverData, group: OpenGroup) =>
  spotsOpen(group) >= 1 &&
  group.memberIds.length >= 2 &&
  group.capacity <= 10 &&
  !clashes(data, group);

export const fitOf = (data: DiscoverData, group: OpenGroup): Fit => {
  const interests = data.viewer.interests;
  const sharedTags = group.tags.filter((tag) => interests.includes(tag));
  const overlap = group.memberIds.filter((id) =>
    memberOf(data, id).likes.some((like) => interests.includes(like)),
  ).length;
  const crowd = overlap / group.memberIds.length;
  const interest = sharedTags.length >= 2 ? 45 : sharedTags.length === 1 ? 35 : 0;
  const size = group.capacity <= 6 ? 10 : group.capacity <= 8 ? 6 : 2;
  const near = group.distance <= 1 ? 10 : group.distance <= 3 ? 7 : 3;
  const you = Math.min(
    100,
    5 + interest + Math.round(crowd * 20) + size + near + (group.newcomerFriendly ? 10 : 0),
  );
  const them = Math.min(
    100,
    10 +
      (sharedTags.length ? 30 : 5) +
      (group.newcomerFriendly ? 15 : 5) +
      Math.round(crowd * 25) +
      (spotsOpen(group) >= 3 ? 10 : 5),
  );
  return { you, them, mutual: Math.round(Math.sqrt(you * them)), sharedTags, overlap };
};

export const whenMatches = (data: DiscoverData, group: OpenGroup, when: WhenId) => {
  if (when === "now") return hoursUntil(data, group) <= SOON_HOURS;
  if (when === "tonight") return group.day === 0;
  if (when === "weekend") return group.day <= 1;
  return true;
};

export const sizeMatches = (group: OpenGroup, size: SizeId) =>
  size === "any" ||
  (size === "cozy"
    ? group.capacity <= 4
    : size === "small"
      ? group.capacity >= 5 && group.capacity <= 6
      : group.capacity >= 7);

export interface Pick {
  /** Best group first. */
  groups: OpenGroup[];
  /** Why the picks are looser than the answers, if they are. */
  note: string;
}

/** Tries the exact answers first, then loosens size, activity and time in turn. */
export const findGroups = (data: DiscoverData, answers: Answers): Pick => {
  const wantsActivity = (group: OpenGroup) =>
    !answers.want.length || answers.want.includes(group.category);
  const hostOk = (group: OpenGroup) => !answers.host || group.newcomerFriendly;
  const tiers: [(group: OpenGroup) => boolean, string][] = [
    [
      (group) =>
        whenMatches(data, group, answers.when) &&
        sizeMatches(group, answers.size) &&
        wantsActivity(group) &&
        hostOk(group),
      "",
    ],
    [
      (group) => whenMatches(data, group, answers.when) && wantsActivity(group) && hostOk(group),
      "No group matched your size exactly, so this is the closest.",
    ],
    [
      (group) => whenMatches(data, group, answers.when) && hostOk(group),
      "Nothing open matched that activity in your time, so this is the closest.",
    ],
    [hostOk, "Nothing open at that time, so this is the soonest that fits you."],
  ];

  for (const [test, note] of tiers) {
    const groups = data.groups.filter(
      (group) => eligible(data, group) && test(group) && fitOf(data, group).mutual >= MIN_FIT,
    );
    if (groups.length) {
      const bias = (group: OpenGroup) =>
        answers.when === "now" && hoursUntil(data, group) <= SOON_HOURS ? -3 : 0;
      groups.sort(
        (a, b) => fitOf(data, b).mutual - fitOf(data, a).mutual + bias(a),
      );
      return { groups, note };
    }
  }
  return { groups: [], note: "" };
};
