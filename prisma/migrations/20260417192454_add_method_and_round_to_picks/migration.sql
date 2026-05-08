/*
  Warnings:

  - Added the required column `method` to the `FightResult` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickedMethod` to the `PickChoice` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PickMethod" AS ENUM ('KO_TKO', 'SUBMISSION', 'DECISION');

-- CreateEnum
CREATE TYPE "FightMethod" AS ENUM ('KO_TKO', 'SUBMISSION', 'DECISION');

-- AlterTable
ALTER TABLE "FightResult" ADD COLUMN     "method" "FightMethod" NOT NULL,
ADD COLUMN     "round" INTEGER;

-- AlterTable
ALTER TABLE "PickChoice" ADD COLUMN     "pickedMethod" "PickMethod" NOT NULL,
ADD COLUMN     "pickedRound" INTEGER;
