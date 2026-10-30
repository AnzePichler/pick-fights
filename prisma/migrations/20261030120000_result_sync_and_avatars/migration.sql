CREATE TYPE "ResultSource" AS ENUM ('MANUAL', 'UFCALENDAR');

CREATE TABLE "UserAvatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserAvatar_userId_key" ON "UserAvatar"("userId");
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event"
    ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "providerEventId" TEXT,
    ADD COLUMN "nextSyncAt" TIMESTAMP(3),
    ADD COLUMN "syncLeaseUntil" TIMESTAMP(3),
    ADD COLUMN "syncLeaseToken" TEXT,
    ADD COLUMN "lastSyncAt" TIMESTAMP(3),
    ADD COLUMN "lastSyncError" TEXT,
    ADD COLUMN "syncFailures" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "syncFinishedAt" TIMESTAMP(3),
    ADD COLUMN "resultVersion" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastResultAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Event_providerEventId_key" ON "Event"("providerEventId");
CREATE INDEX "Event_syncEnabled_nextSyncAt_idx" ON "Event"("syncEnabled", "nextSyncAt");

ALTER TABLE "Fight"
    ADD COLUMN "providerFightId" TEXT,
    ADD COLUMN "providerFighterAId" TEXT,
    ADD COLUMN "providerFighterBId" TEXT;
CREATE UNIQUE INDEX "Fight_providerFightId_key" ON "Fight"("providerFightId");

ALTER TABLE "PickChoice"
    ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "rarityMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN "winnerPickCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "totalPickCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FightResult" ADD COLUMN "source" "ResultSource" NOT NULL DEFAULT 'MANUAL';
UPDATE "FightResult" SET "source" = 'UFCALENDAR' WHERE "status" = 'PENDING';

CREATE TABLE "FightResultChange" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "source" "ResultSource" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FightResultChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FightResultChange_fightId_createdAt_idx" ON "FightResultChange"("fightId", "createdAt");
ALTER TABLE "FightResultChange" ADD CONSTRAINT "FightResultChange_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
