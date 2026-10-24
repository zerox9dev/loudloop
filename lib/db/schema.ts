import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const platformEnum = pgEnum('platform', ['telegram', 'instagram', 'threads', 'x', 'linkedin']);
export const accountStatusEnum = pgEnum('account_status', ['connected', 'demo', 'error', 'disconnected']);
export const postKindEnum = pgEnum('post_kind', ['post', 'photo', 'story', 'reel']);
export const postStatusEnum = pgEnum('post_status', [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'partial',
  'failed',
  'review', // generated draft waiting for the owner's approval
]);
export const projectKindEnum = pgEnum('project_kind', ['founder', 'product']);
export const targetStatusEnum = pgEnum('target_status', ['pending', 'published', 'failed']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  /** interface language: en | uk | ru (also the default language for generated content) */
  locale: varchar('locale', { length: 5 }).notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** What the generator needs to write on-brand posts. Same shape for a founder and a product. */
export type ProjectBrief = {
  /** product: what it does and why; founder: who you are, what you build, your story */
  about?: string;
  audience?: string;
  /** tone of voice, e.g. "прямо, с самоиронией, без маркетинговых штампов" */
  voice?: string;
  /** content pillars / recurring themes */
  pillars?: string[];
  /** first link is the primary one (landing page) */
  links?: { label: string; url: string }[];
  /** founder only: max % of posts that may promote products (the rest is personal brand) */
  promoShare?: number;
  /** words, claims or topics to avoid */
  avoid?: string;
  /** language of generated posts (en | uk | ru); defaults to the owner's interface language */
  language?: string;
};

/**
 * A workspace. The founder project is the owner's personal brand (their own accounts);
 * product projects are the things they build. Everything hangs off a project.
 */
export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 48 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    kind: projectKindEnum('kind').notNull().default('product'),
    brief: jsonb('brief').$type<ProjectBrief>().notNull().default({}),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  // exactly one personal brand
  (t) => [uniqueIndex('projects_single_founder').on(t.kind).where(sql`${t.kind} = 'founder'`)],
);

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'restrict' }),
  platform: platformEnum('platform').notNull(),
  handle: varchar('handle', { length: 120 }).notNull(),
  displayName: varchar('display_name', { length: 120 }),
  externalId: varchar('external_id', { length: 120 }),
  status: accountStatusEnum('status').notNull().default('disconnected'),
  // AES-GCM encrypted JSON (see lib/crypto.ts)
  credentials: text('credentials'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  lastError: text('last_error'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  /** when the one-time backfill of already published posts finished */
  historyImportedAt: timestamp('history_imported_at', { withTimezone: true }),
  /** last history-import failure; kept apart from lastError, which every sync rewrites */
  historyError: text('history_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('accounts_project').on(t.projectId),
  // one platform identity can live in exactly one project
  uniqueIndex('accounts_platform_external').on(t.platform, t.externalId),
]);

export const metricSnapshots = pgTable(
  'metric_snapshots',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    followers: integer('followers').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('metric_snapshots_account_day').on(t.accountId, t.day)],
);

/** `s3` is set once the file is mirrored to the bucket; older uploads fall back to PUBLIC_MEDIA_URL. */
export type MediaItem = { path: string; mime: string; width?: number; height?: number; s3?: boolean };

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: postKindEnum('kind').notNull().default('post'),
    text: text('text').notNull().default(''),
    media: jsonb('media').$type<MediaItem[]>().notNull().default([]),
    status: postStatusEnum('status').notNull().default('draft'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    sourceItemId: integer('source_item_id'),
    ideaId: integer('idea_id').references(() => ideas.id, { onDelete: 'set null' }),
    /** pulled from the platform (published outside the app) — read-only here */
    imported: boolean('imported').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('posts_status').on(t.status), index('posts_scheduled_at').on(t.scheduledAt), index('posts_project').on(t.projectId)],
);

export const postTargets = pgTable(
  'post_targets',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    status: targetStatusEnum('status').notNull().default('pending'),
    /** platform-native variant; null = use the post's base text */
    text: text('text'),
    externalId: varchar('external_id', { length: 120 }),
    url: text('url'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    views: integer('views').notNull().default(0),
    reactions: integer('reactions').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    shares: integer('shares').notNull().default(0),
    metricsUpdatedAt: timestamp('metrics_updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('post_targets_post_account').on(t.postId, t.accountId),
    // a platform post maps to at most one target: makes history import idempotent
    uniqueIndex('post_targets_account_external').on(t.accountId, t.externalId),
    index('post_targets_published_at').on(t.publishedAt),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    targetId: integer('target_id').references(() => postTargets.id, { onDelete: 'set null' }),
    externalId: varchar('external_id', { length: 120 }).notNull(),
    authorName: varchar('author_name', { length: 160 }).notNull(),
    authorHandle: varchar('author_handle', { length: 160 }),
    text: text('text').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    replyText: text('reply_text'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('comments_account_external').on(t.accountId, t.externalId),
    index('comments_unread').on(t.isRead),
  ],
);

export const goals = pgTable(
  'goals',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    month: varchar('month', { length: 7 }).notNull(), // YYYY-MM
    target: integer('target').notNull(),
  },
  (t) => [uniqueIndex('goals_account_month').on(t.accountId, t.month)],
);

export const insights = pgTable(
  'insights',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    emoji: varchar('emoji', { length: 16 }).notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('insights_account_day').on(t.accountId, t.day)],
);

export const signals = pgTable('signals', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  targetId: integer('target_id').references(() => postTargets.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 40 }).notNull(), // viral_post | growth_spike | growth_drop | silence | token_expiring | publish_failed
  severity: varchar('severity', { length: 10 }).notNull().default('info'), // info | good | warn
  title: text('title').notNull(),
  body: text('body'),
  /** values for the localized title/body (messages: signals.<kind>); title/body are a fallback */
  params: jsonb('params').$type<Record<string, string | number>>(),
  dedupeKey: varchar('dedupe_key', { length: 160 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const challenges = pgTable('challenges', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 160 }).notNull(),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  postsPerDay: integer('posts_per_day').notNull().default(1),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 160 }).notNull(),
  url: text('url').notNull(),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('sources_project_url').on(t.projectId, t.url)]);

export const sourceItems = pgTable(
  'source_items',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    guid: text('guid').notNull(),
    title: text('title').notNull(),
    link: text('link'),
    summary: text('summary'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('source_items_source_guid').on(t.sourceId, t.guid)],
);

export const shareLinks = pgTable('share_links', {
  id: serial('id').primaryKey(),
  /** null = read-only view across all projects */
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export type Project = typeof projects.$inferSelect;
export type Platform = (typeof platformEnum.enumValues)[number];
export type PostKind = (typeof postKindEnum.enumValues)[number];
export type Account = typeof accounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostTarget = typeof postTargets.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type User = typeof users.$inferSelect;

/** Raw material for posts: product events (releases, changelog), RSS items, notes. */
export const ideas = pgTable(
  'ideas',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16 }).notNull().default('note'), // note | event | rss
    title: text('title').notNull(),
    body: text('body'),
    url: text('url'),
    sourceItemId: integer('source_item_id').references(() => sourceItems.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 16 }).notNull().default('new'), // new | drafted | dismissed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ideas_project_status').on(t.projectId, t.status), uniqueIndex('ideas_source_item').on(t.sourceItemId)],
);

/** Weekly posting slots per account: the queue fills these instead of hand-picked times. */
export const slots = pgTable(
  'slots',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(), // ISO: 1 = Monday … 7 = Sunday
    time: varchar('time', { length: 5 }).notNull(), // HH:MM, local time
  },
  (t) => [uniqueIndex('slots_account_weekday_time').on(t.accountId, t.weekday, t.time)],
);

/** Own short links (/l/:code) with UTM tags: clicks per product, platform and post. */
export const links = pgTable(
  'links',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 16 }).notNull().unique(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    targetId: integer('target_id').references(() => postTargets.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    clicks: integer('clicks').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('links_project').on(t.projectId), index('links_target').on(t.targetId)],
);

export const linkClicks = pgTable(
  'link_clicks',
  {
    id: serial('id').primaryKey(),
    linkId: integer('link_id')
      .notNull()
      .references(() => links.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    referrer: text('referrer'),
  },
  (t) => [index('link_clicks_link_at').on(t.linkId, t.at)],
);

export type Idea = typeof ideas.$inferSelect;
export type Slot = typeof slots.$inferSelect;
export type ProjectKind = (typeof projectKindEnum.enumValues)[number];
