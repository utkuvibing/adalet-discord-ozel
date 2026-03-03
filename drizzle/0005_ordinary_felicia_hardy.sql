CREATE TABLE IF NOT EXISTS `dm_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fromUserId` integer NOT NULL,
	`toUserId` integer NOT NULL,
	`content` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`fromUserId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`toUserId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `friend_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fromUserId` integer NOT NULL,
	`toUserId` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`actedAt` integer,
	FOREIGN KEY (`fromUserId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`toUserId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `friendships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userAId` integer NOT NULL,
	`userBId` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`userAId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userBId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `profilePhotoUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `profileBannerGifUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `bio` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `updatedAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `users` SET `updatedAt` = COALESCE(`updatedAt`, `createdAt`, CAST(strftime('%s','now') AS integer));
