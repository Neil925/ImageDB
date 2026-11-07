import { integer, sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core";

export const RATINGS = ["general", "sensitive", "questionable", "explicit"] as const;
export type Rating = (typeof RATINGS)[number];

export const TAG_CATEGORIES = ["general", "artist", "character", "copyright", "meta"] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const POST_STATUSES = ["active", "pending", "deleted"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const posts = sqliteTable(
  "posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sha256: text("sha256").notNull().unique(),
    originalPath: text("original_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    largePath: text("large_path"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    filesize: integer("filesize").notNull(),
    mime: text("mime").notNull(),
    rating: text("rating").$type<Rating>().notNull(),
    status: text("status").$type<PostStatus>().notNull().default("active"),
    sourceUrl: text("source_url"),
    createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  },
  (t) => [
    index("posts_status_created_idx").on(t.status, t.createdAt, t.id),
  ],
);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category").$type<TagCategory>().notNull().default("general"),
  postCount: integer("post_count").notNull().default(0),
});

export const postTags = sqliteTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tags_tag_idx").on(t.tagId),
  ],
);

export const tagAliases = sqliteTable("tag_aliases", {
  alias: text("alias").primaryKey(),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
});

export const tagImplications = sqliteTable(
  "tag_implications",
  {
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    impliedTagId: integer("implied_tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.tagId, t.impliedTagId] })],
);
