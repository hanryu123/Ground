-- CreateEnum (safe on reordered migration history)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GameStatus') THEN
    CREATE TYPE "GameStatus" AS ENUM ('BEFORE', 'LIVE', 'RESULT', 'CANCEL');
  END IF;
END
$$;

-- Ensure NotificationType exists and has SCORE_UPDATE regardless of execution order.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM (
      'SYSTEM',
      'PROMOTION',
      'GAME_START',
      'GAME_RESULT',
      'PREDICTION_REMINDER',
      'SCORE_UPDATE'
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'SCORE_UPDATE'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'SCORE_UPDATE';
  END IF;
END
$$;

-- AlterTable
ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "favoriteTeam" TEXT;

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "status" "GameStatus" NOT NULL DEFAULT 'BEFORE',
    "gameDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_externalId_key" ON "Game"("externalId");

-- CreateIndex
CREATE INDEX "Game_status_updatedAt_idx" ON "Game"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Game_homeTeam_awayTeam_idx" ON "Game"("homeTeam", "awayTeam");
