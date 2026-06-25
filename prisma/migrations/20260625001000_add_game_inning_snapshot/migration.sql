-- Store the latest inning snapshot so cron can detect Live Activity-only changes.
ALTER TABLE "Game" ADD COLUMN "currentInning" INTEGER;
ALTER TABLE "Game" ADD COLUMN "currentInningHalf" TEXT;
ALTER TABLE "Game" ADD COLUMN "currentInningLabel" TEXT;
