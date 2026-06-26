-- Store the latest inning snapshot so cron can detect Live Activity-only changes.
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "currentInning" INTEGER;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "currentInningHalf" TEXT;
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "currentInningLabel" TEXT;
