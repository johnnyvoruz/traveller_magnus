-- Passkey columns confirmed against @better-auth/passkey 1.7.7 schema
-- (dist/index-B7Y0IgKK.d.mts): name, publicKey, userId, credentialID, counter,
-- deviceType, backedUp, transports, createdAt, aaguid, plus the model id.
-- Stored snake_case, same as the user and session tables. credentialID is credential_id.
ALTER TABLE `user` ADD COLUMN `username` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);
--> statement-breakpoint
ALTER TABLE `session` ADD COLUMN `must_add_passkey` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`public_key` text NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text,
	`created_at` integer,
	`aaguid` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkey_credentialID_unique` ON `passkey` (`credential_id`);
--> statement-breakpoint
CREATE TABLE `recovery_code` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_code_userId_idx` ON `recovery_code` (`user_id`);
--> statement-breakpoint
CREATE TABLE `recovery_failure` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_failure_userId_idx` ON `recovery_failure` (`user_id`);
--> statement-breakpoint
CREATE TABLE `recovery_envelope` (
	`user_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `passkey_signup` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `passkey_signup_address_idx` ON `passkey_signup` (`address`, `created_at`);
