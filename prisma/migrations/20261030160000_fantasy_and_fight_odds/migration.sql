ALTER TABLE "Fight"
ADD COLUMN "fighterAOdds" INTEGER,
ADD COLUMN "fighterBOdds" INTEGER,
ADD COLUMN "fighterAIsUnderdog" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fighterBIsUnderdog" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "Fight_fighterAOdds_valid" CHECK ("fighterAOdds" IS NULL OR "fighterAOdds" <= -100 OR "fighterAOdds" >= 100),
ADD CONSTRAINT "Fight_fighterBOdds_valid" CHECK ("fighterBOdds" IS NULL OR "fighterBOdds" <= -100 OR "fighterBOdds" >= 100),
ADD CONSTRAINT "Fight_fighterA_underdog_matches_odds" CHECK ("fighterAIsUnderdog" = COALESCE("fighterAOdds" > 100, false)),
ADD CONSTRAINT "Fight_fighterB_underdog_matches_odds" CHECK ("fighterBIsUnderdog" = COALESCE("fighterBOdds" > 100, false));

CREATE TYPE "FantasySlot" AS ENUM ('CAPTAIN', 'FINISH_ONE', 'FINISH_TWO', 'DECISION', 'UNDERDOG');

CREATE TABLE "FantasyLineup" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FantasyLineup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FantasyLineup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FantasyLineup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "FantasyChoice" (
  "id" TEXT NOT NULL,
  "lineupId" TEXT NOT NULL,
  "slot" "FantasySlot" NOT NULL,
  "fightId" TEXT NOT NULL,
  "fighterId" TEXT NOT NULL,
  CONSTRAINT "FantasyChoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FantasyChoice_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "FantasyLineup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FantasyChoice_fightId_fkey" FOREIGN KEY ("fightId") REFERENCES "Fight"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FantasyLineup_userId_eventId_key" ON "FantasyLineup"("userId", "eventId");
CREATE INDEX "FantasyLineup_eventId_idx" ON "FantasyLineup"("eventId");
CREATE UNIQUE INDEX "FantasyChoice_lineupId_slot_key" ON "FantasyChoice"("lineupId", "slot");
CREATE UNIQUE INDEX "FantasyChoice_lineupId_fighterId_key" ON "FantasyChoice"("lineupId", "fighterId");
CREATE INDEX "FantasyChoice_fightId_idx" ON "FantasyChoice"("fightId");
