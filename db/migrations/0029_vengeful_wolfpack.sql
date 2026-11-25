CREATE TABLE `character_folder_members` (
	`character_id` integer NOT NULL,
	`folder_id` integer NOT NULL,
	PRIMARY KEY(`character_id`, `folder_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `character_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_folder_members_character_id_unique` ON `character_folder_members` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer
);
