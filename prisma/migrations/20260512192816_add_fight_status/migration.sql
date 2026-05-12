-- CreateEnum
CREATE TYPE "FightStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'REPLACED');

-- AlterTable
ALTER TABLE "Fight" ADD COLUMN     "status" "FightStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Fight_eventId_status_idx" ON "Fight"("eventId", "status");
