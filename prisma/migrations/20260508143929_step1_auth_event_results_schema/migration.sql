-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FightResultStatus" AS ENUM ('PENDING', 'WINNER', 'DRAW', 'NO_CONTEST', 'CANCELLED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Fight" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FightResult" ADD COLUMN     "status" "FightResultStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "method" DROP NOT NULL,
ALTER COLUMN "winnerFighterId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PickChoice" ALTER COLUMN "pickedMethod" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Event_isActive_status_idx" ON "Event"("isActive", "status");

-- CreateIndex
CREATE INDEX "Fight_eventId_idx" ON "Fight"("eventId");

-- CreateIndex
CREATE INDEX "Fight_fighterAId_idx" ON "Fight"("fighterAId");

-- CreateIndex
CREATE INDEX "Fight_fighterBId_idx" ON "Fight"("fighterBId");

-- CreateIndex
CREATE INDEX "FightResult_winnerFighterId_idx" ON "FightResult"("winnerFighterId");

-- CreateIndex
CREATE INDEX "PickChoice_fightId_idx" ON "PickChoice"("fightId");

-- CreateIndex
CREATE INDEX "PickChoice_pickedFighterId_idx" ON "PickChoice"("pickedFighterId");

-- CreateIndex
CREATE INDEX "PickSubmission_eventId_idx" ON "PickSubmission"("eventId");
