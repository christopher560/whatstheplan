import { groupIds, sampleGroup } from "@/data/group.ts";
import type { GroupDetail } from "@/data/group.ts";

/**
 * Everything one group's page reads and writes. Backed by sample data today.
 * The Supabase version reads `meetup_groups`, `meetup_members` and the latest
 * `group_messages`, subscribes to `group_messages` with Realtime so chat is
 * live, and writes through RPCs that check membership (see SUPABASE.md).
 * Leaving, the calendar pin and friend requests reuse `discover-repo` and
 * `plans-repo`.
 */
export interface GroupRepo {
  getGroup(id: string): Promise<GroupDetail | null>;
  /** Ids of every group, for static page generation. */
  listGroupIds(): Promise<string[]>;
  /** The viewer's answer to the group's plan; `null` clears it. */
  setGoing(groupId: string, going: boolean | null): Promise<void>;
  /** Votes for a poll option, or clears the vote with `null`. */
  vote(groupId: string, optionId: string | null): Promise<void>;
  /** Posts a message. The text is trimmed and capped server-side. */
  sendMessage(groupId: string, text: string): Promise<void>;
  /** Hides a member from the viewer everywhere. Writes `blocks`. */
  blockMember(memberId: string): Promise<void>;
  /** Files a report. Writes `reports` and never tells the reported person. */
  reportMember(memberId: string, reasonId: string): Promise<void>;
}

const mockRepo: GroupRepo = {
  async getGroup(id) {
    return sampleGroup(id);
  },
  async listGroupIds() {
    return groupIds;
  },
  async setGoing() {},
  async vote() {},
  async sendMessage() {},
  async blockMember() {},
  async reportMember() {},
};

export const groupRepo: GroupRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const setGoing = (groupId: string, going: boolean | null) =>
  groupRepo.setGoing(groupId, going);
export const vote = (groupId: string, optionId: string | null) =>
  groupRepo.vote(groupId, optionId);
export const sendMessage = (groupId: string, text: string) =>
  groupRepo.sendMessage(groupId, text);
export const blockMember = (memberId: string) => groupRepo.blockMember(memberId);
export const reportMember = (memberId: string, reasonId: string) =>
  groupRepo.reportMember(memberId, reasonId);
