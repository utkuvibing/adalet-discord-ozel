ALTER TABLE `invite_tokens` ADD `maxUses` integer;--> statement-breakpoint
ALTER TABLE `invite_tokens` ADD `useCount` integer DEFAULT 0 NOT NULL;