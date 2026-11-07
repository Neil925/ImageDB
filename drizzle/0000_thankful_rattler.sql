CREATE TABLE `post_tags` (
	`post_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `tag_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_tags_tag_idx` ON `post_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha256` text NOT NULL,
	`original_path` text NOT NULL,
	`thumb_path` text NOT NULL,
	`large_path` text,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`filesize` integer NOT NULL,
	`mime` text NOT NULL,
	`rating` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_sha256_unique` ON `posts` (`sha256`);--> statement-breakpoint
CREATE INDEX `posts_status_created_idx` ON `posts` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `tag_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tag_implications` (
	`tag_id` integer NOT NULL,
	`implied_tag_id` integer NOT NULL,
	PRIMARY KEY(`tag_id`, `implied_tag_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`implied_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);