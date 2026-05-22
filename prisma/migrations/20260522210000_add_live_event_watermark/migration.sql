-- CreateTable
CREATE TABLE "LiveEventWatermark" (
    "id" TEXT NOT NULL,
    "gameExternalId" TEXT NOT NULL,
    "lastSeqNo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveEventWatermark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveEventWatermark_gameExternalId_key" ON "LiveEventWatermark"("gameExternalId");

-- CreateIndex
CREATE INDEX "LiveEventWatermark_updatedAt_idx" ON "LiveEventWatermark"("updatedAt");
