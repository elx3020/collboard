-- The column was added nullable with no default, so every user who had never
-- touched their notification settings held NULL. The recipient filter runs
-- `NOT (mutedNotificationTypes @> ARRAY[...])`, and in SQL `NOT NULL` is NULL,
-- not true — so those users were silently dropped from every notification.
--
-- Backfill first, then make the state unrepresentable.
UPDATE "User" SET "mutedNotificationTypes" = '{}' WHERE "mutedNotificationTypes" IS NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "mutedNotificationTypes" SET DEFAULT ARRAY[]::"NotificationType"[];
ALTER TABLE "User" ALTER COLUMN "mutedNotificationTypes" SET NOT NULL;
