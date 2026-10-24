import type { Account, MediaItem, Platform, PostKind } from '@/lib/db/schema';

export type PublishInput = {
  kind: PostKind;
  text: string;
  media: MediaItem[];
  /** Public URLs for media (needed by Meta APIs that pull media by URL). */
  mediaUrls: string[];
  /** Absolute local paths for media (for APIs that accept uploads). */
  mediaFiles: string[];
};

export type PublishResult = { externalId: string; url?: string };

/** followers is null when the platform doesn't expose it (e.g. LinkedIn member profiles). */
export type AccountStats = { followers: number | null };

export type PostMetrics = { views: number; reactions: number; comments: number; shares: number };

/** A post that already exists on the platform (published here or natively). */
export type RemotePost = {
  externalId: string;
  url?: string;
  text: string;
  kind: PostKind;
  publishedAt: Date;
  metrics?: PostMetrics;
};

export type FetchPostsOptions = { since?: Date; limit: number };

export type RemoteComment = {
  externalId: string;
  postExternalId?: string;
  authorName: string;
  authorHandle?: string;
  text: string;
  postedAt: Date;
};

export type ProviderContext<C = Record<string, unknown>> = {
  account: Account;
  credentials: C;
  /** Persist refreshed credentials (e.g. rotated tokens). */
  saveCredentials: (next: C, expiresAt?: Date | null) => Promise<void>;
};

export interface ProviderAdapter<C = Record<string, unknown>> {
  platform: Platform;
  publish(ctx: ProviderContext<C>, input: PublishInput): Promise<PublishResult>;
  fetchStats(ctx: ProviderContext<C>): Promise<AccountStats>;
  fetchPostMetrics(ctx: ProviderContext<C>, externalIds: string[]): Promise<Record<string, PostMetrics>>;
  fetchComments(ctx: ProviderContext<C>, postExternalIds: string[]): Promise<RemoteComment[]>;
  reply(ctx: ProviderContext<C>, comment: { externalId: string; postExternalId?: string }, text: string): Promise<void>;
  /**
   * Posts already on the platform, newest first. Optional: platforms whose API can't list
   * a profile's posts (LinkedIn members, Telegram without an MTProto session) omit it.
   */
  fetchPosts?(ctx: ProviderContext<C>, opts: FetchPostsOptions): Promise<RemotePost[]>;
  /** Daily follower totals for the past days, oldest first, when the platform keeps history. */
  fetchFollowerHistory?(ctx: ProviderContext<C>, days: number): Promise<{ day: string; followers: number }[]>;
  /** Daily profile views from `since` (or as far back as the platform keeps), oldest first. */
  fetchViewHistory?(ctx: ProviderContext<C>, since: Date | null): Promise<{ day: string; views: number }[]>;
  /** Refresh long-lived tokens if they expire soon. */
  refresh?(ctx: ProviderContext<C>): Promise<void>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}
