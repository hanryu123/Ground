-- Add safety latch for one-time lineup push trigger.
ALTER TABLE "Game"
ADD COLUMN "isLineupNotified" BOOLEAN NOT NULL DEFAULT false;
