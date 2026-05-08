-- AlterTable
ALTER TABLE "Fighter" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "height" TEXT,
ADD COLUMN     "lastFight" TEXT,
ADD COLUMN     "ranking" INTEGER,
ADD COLUMN     "reach" TEXT,
ADD COLUMN     "record" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "winsByDec" INTEGER,
ADD COLUMN     "winsByKo" INTEGER,
ADD COLUMN     "winsBySub" INTEGER;
