import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const jsonb = customType<{ data: unknown }>({ dataType: () => "jsonb" });
// Postgres bit(64): stored/retrieved as a 64-char "0"/"1" string.
const bit64 = customType<{ data: string }>({ dataType: () => "bit(64)" });

export const RATINGS = ["general", "sensitive", "questionable", "explicit"] as const;
export type Rating = (typeof RATINGS)[number];
export const RATING_VALUE: Record<Rating, number> = {
  general: 0,
  sensitive: 1,
  questionable: 2,
  explicit: 3,
};
export const RATING_NAME: Record<number, Rating> = {
  0: "general",
  1: "sensitive",
  2: "questionable",
  3: "explicit",
};

export const TAG_CATEGORIES = ["general", "artist", "character", "copyright", "meta"] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const ROLES = ["viewer", "uploader", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const postStatus = pgEnum("post_status", ["pending", "active", "flagged", "deleted"]);
export const tagCategory = pgEnum("tag_category", TAG_CATEGORIES);

// ---------------------------------------------------------------------------
// Auth (better-auth tables; role is an additional field, plan §10)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: citext("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").$type<Role>().notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Domain (plan §6)
// ---------------------------------------------------------------------------

export const posts = pgTable(
  "posts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sha256: text("sha256").notNull().unique(), // hex; unique ⇒ exact dedupe
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"), // video, v2
    phash: bit64("phash"), // dHash fingerprint as 64-bit string
    rating: smallint("rating").notNull().default(0), // 0 general … 3 explicit
    score: integer("score").notNull().default(0),
    favCount: integer("fav_count").notNull().default(0),
    sourceUrl: text("source_url"),
    uploaderId: text("uploader_id").references(() => users.id),
    status: postStatus("status").notNull().default("pending"),
    parentId: integer("parent_id"), // v2
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("posts_created_idx").on(t.createdAt, t.id).where(sql`status = 'active'`),
    index("posts_score_idx").on(t.score, t.id).where(sql`status = 'active'`),
  ],
);

export const tags = pgTable("tags", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: citext("name").notNull().unique(), // lowercase, underscores
  category: tagCategory("category").notNull().default("general"),
  postCount: integer("post_count").notNull().default(0), // maintained; drives query planning
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postTags = pgTable(
  "post_tags",
  {
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: bigint("tag_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tags_tag_idx").on(t.tagId, t.postId),
  ],
);

export const tagAliases = pgTable("tag_aliases", {
  alias: citext("alias").primaryKey(),
  tagId: bigint("tag_id", { mode: "number" })
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

export const tagImplications = pgTable(
  "tag_implications",
  {
    antecedentId: bigint("antecedent_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    consequentId: bigint("consequent_id", { mode: "number" })
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.antecedentId, t.consequentId] })],
);

export const pools = pgTable("pools", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: citext("name").notNull().unique(),
  description: text("description"),
  category: text("category").notNull().default("set"),
  creatorId: text("creator_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const poolPosts = pgTable(
  "pool_posts",
  {
    poolId: bigint("pool_id", { mode: "number" })
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.poolId, t.postId] }),
    unique("pool_posts_position_idx").on(t.poolId, t.position),
    index("pool_posts_pool_idx").on(t.poolId, t.position),
  ],
);

// v1.1 features — tables exist now (plan §6) so later phases don't migrate.
export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

export const votes = pgTable(
  "votes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: bigint("post_id", { mode: "number" })
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

export const apiKeys = pgTable("api_keys", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(), // scrypt (deviation from plan argon2id: no native dep; see README)
  keyPrefix: text("key_prefix").notNull(), // first 8 chars, for display/lookup
  scopes: text("scopes").array().notNull().default(["read"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: bigint("target_id", { mode: "number" }),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
