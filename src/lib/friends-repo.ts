import { sampleFriends } from "@/data/friends.ts";
import type { FriendsData } from "@/data/friends.ts";

/**
 * Everything the friends page reads and writes. Backed by sample data today.
 * The Supabase version reads `friendships` joined with each friend's shared
 * availability (RLS only returns friends who share), and writes the person's
 * own circle, favorites and private tags (see SUPABASE.md).
 */
export interface FriendsRepo {
  getFriends(): Promise<FriendsData>;
  /** Accepts a friend request, which makes the friendship `accepted`. */
  acceptRequest(friendId: string): Promise<void>;
  /** Declines a friend request. */
  declineRequest(friendId: string): Promise<void>;
  setFavorite(friendId: string, favorite: boolean): Promise<void>;
  /** Replaces the viewer's private labels for a friend. */
  setTags(friendId: string, tags: string[]): Promise<void>;
  /** Replaces the friends in the viewer's inner circle. */
  setCircle(friendIds: string[]): Promise<void>;
}

const mockRepo: FriendsRepo = {
  async getFriends() {
    return sampleFriends;
  },
  async acceptRequest() {},
  async declineRequest() {},
  async setFavorite() {},
  async setTags() {},
  async setCircle() {},
};

export const friendsRepo: FriendsRepo = mockRepo;

/** The browser calls these; swap their bodies for Astro Action calls later. */
export const acceptRequest = (friendId: string) => friendsRepo.acceptRequest(friendId);
export const declineRequest = (friendId: string) => friendsRepo.declineRequest(friendId);
export const setFavorite = (friendId: string, favorite: boolean) =>
  friendsRepo.setFavorite(friendId, favorite);
export const setTags = (friendId: string, tags: string[]) => friendsRepo.setTags(friendId, tags);
export const setCircle = (friendIds: string[]) => friendsRepo.setCircle(friendIds);
