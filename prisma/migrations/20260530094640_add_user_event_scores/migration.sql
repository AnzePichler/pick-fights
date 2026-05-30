-- CreateTable
CREATE TABLE "UserEventScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "totalPicked" INTEGER NOT NULL DEFAULT 0,
    "correctPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEventScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserEventScore_eventId_idx" ON "UserEventScore"("eventId");

-- CreateIndex
CREATE INDEX "UserEventScore_userId_idx" ON "UserEventScore"("userId");

-- CreateIndex
CREATE INDEX "UserEventScore_eventId_points_idx" ON "UserEventScore"("eventId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "UserEventScore_userId_eventId_key" ON "UserEventScore"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "UserEventScore" ADD CONSTRAINT "UserEventScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventScore" ADD CONSTRAINT "UserEventScore_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
