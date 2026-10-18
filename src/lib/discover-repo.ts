import { sampleDiscover } from "@/data/discover.ts";
import type { DiscoverData } from "@/data/discover.ts";

/**
 * Everything the Discover page reads and writes. Backed by sample data today.
 * The Supabase version reads open `meetup_groups` near the viewer's area
 * (PostGIS), already limited to the viewer's age band, and joins the signed-in
 * person into `meetup_members` (see SUPABASE.md).
 */
export interface DiscoverRepo {
  getDiscover(): Promise<DiscoverData>;
  /** Adds the viewer to an open group. Rejects when the group is full. */
  joinGroup(groupId: string): Promise<void>;
  /** Removes the viewer from a group. */
  leaveGroup(groupId: string): Promise<void>;
}

const mockRepo: DiscoverRepo = {
  async getDiscover() {
    return sampleDiscover;
  },
  async joinGroup() {},
  async leaveGroup() {},
};

export const discoverRepo: DiscoverRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const joinGroup = (groupId: string) => discoverRepo.joinGroup(groupId);
export const leaveGroup = (groupId: string) => discoverRepo.leaveGroup(groupId);
