/*
  Warnings:

  - You are about to drop the column `fighterAName` on the `Fight` table. All the data in the column will be lost.
  - You are about to drop the column `fighterBName` on the `Fight` table. All the data in the column will be lost.
  - You are about to drop the column `winnerName` on the `FightResult` table. All the data in the column will be lost.
  - You are about to drop the column `pickedName` on the `PickChoice` table. All the data in the column will be lost.
  - Added the required column `fighterAId` to the `Fight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fighterBId` to the `Fight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `winnerFighterId` to the `FightResult` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickedFighterId` to the `PickChoice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Fight" DROP COLUMN "fighterAName",
DROP COLUMN "fighterBName",
ADD COLUMN     "fighterAId" TEXT NOT NULL,
ADD COLUMN     "fighterBId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "FightResult" DROP COLUMN "winnerName",
ADD COLUMN     "winnerFighterId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PickChoice" DROP COLUMN "pickedName",
ADD COLUMN     "pickedFighterId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Fighter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fighter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fighter_name_key" ON "Fighter"("name");

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_fighterAId_fkey" FOREIGN KEY ("fighterAId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fight" ADD CONSTRAINT "Fight_fighterBId_fkey" FOREIGN KEY ("fighterBId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickChoice" ADD CONSTRAINT "PickChoice_pickedFighterId_fkey" FOREIGN KEY ("pickedFighterId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FightResult" ADD CONSTRAINT "FightResult_winnerFighterId_fkey" FOREIGN KEY ("winnerFighterId") REFERENCES "Fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
