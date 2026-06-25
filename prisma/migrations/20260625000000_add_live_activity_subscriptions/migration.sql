-- CreateTable
CREATE TABLE "LiveActivitySubscription" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "activityId" TEXT,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "appEnv" TEXT NOT NULL DEFAULT 'production',
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "LiveActivitySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveActivitySubscription_token_key" ON "LiveActivitySubscription"("token");

-- CreateIndex
CREATE INDEX "LiveActivitySubscription_enabled_gameId_teamId_idx" ON "LiveActivitySubscription"("enabled", "gameId", "teamId");

-- CreateIndex
CREATE INDEX "LiveActivitySubscription_activityId_idx" ON "LiveActivitySubscription"("activityId");

-- CreateIndex
CREATE INDEX "LiveActivitySubscription_teamId_enabled_idx" ON "LiveActivitySubscription"("teamId", "enabled");

-- CreateIndex
CREATE INDEX "LiveActivitySubscription_endedAt_idx" ON "LiveActivitySubscription"("endedAt");
