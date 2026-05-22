-- CreateTable
CREATE TABLE "NativePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "favoriteTeam" TEXT,
    "topics" JSONB,
    "appEnv" TEXT NOT NULL DEFAULT 'production',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "NativePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NativePushToken_token_key" ON "NativePushToken"("token");

-- CreateIndex
CREATE INDEX "NativePushToken_userId_idx" ON "NativePushToken"("userId");

-- CreateIndex
CREATE INDEX "NativePushToken_enabled_favoriteTeam_idx" ON "NativePushToken"("enabled", "favoriteTeam");

-- AddForeignKey
ALTER TABLE "NativePushToken" ADD CONSTRAINT "NativePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
