import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { assertLocalContainer, sandboxUrl, demoEmail, demoPassword } from "./local-sandbox-config.mjs";
import { fightOddsData } from "../lib/fight-odds.mjs";

async function main() {
  if (process.env.PICKFIGHTS_LOCAL_SANDBOX !== "1" || process.env.DATABASE_URL !== sandboxUrl || process.env.DIRECT_URL !== sandboxUrl) {
    throw new Error("Run npm run local:setup. This seed refuses any other database target.");
  }
  assertLocalContainer();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: sandboxUrl }) });
  try {
    const [identity] = await prisma.$queryRaw<{ database: string; username: string }[]>`SELECT current_database()::text AS database, current_user::text AS username`;
    if (identity.database !== "pickfights_fantasy_local" || identity.username !== "pickfights_local") {
      throw new Error("Unexpected database identity; refusing fixture writes.");
    }
    const passwordHash = await bcrypt.hash(demoPassword, 10);
    await prisma.$transaction(async (tx) => {
      for (const [id, email, username] of [
        ["local-demo-user", demoEmail, "local_demo"],
        ["local-rival-user", "rival@pickfights.local", "local_rival"],
      ]) {
        await tx.user.upsert({
          where: { id },
          create: { id, email, username, displayName: `${username} (LOCAL DEMO)`, passwordHash },
          update: { passwordHash },
        });
      }
      await tx.event.upsert({
        where: { id: "local-fantasy-event" },
        create: {
          id: "local-fantasy-event", name: "LOCAL DEMO · Fantasy Fight Night", slug: "local-fantasy-demo",
          startsAt: new Date(Date.now() + 48 * 3600000), lockAt: new Date(Date.now() + 24 * 3600000), status: "OPEN", isActive: true,
        },
        update: {
          startsAt: new Date(Date.now() + 48 * 3600000), lockAt: new Date(Date.now() + 24 * 3600000), status: "OPEN", isActive: true,
        },
      });
      const pairs = [
        ["Alex Anchor", "Blake Storm", -200, 160],
        ["Casey Spark", "Drew Stone", -150, 125],
        ["Elliot Grip", "Frankie Rush", -180, 150],
        ["Gray Rounds", "Harper Edge", 100, -120],
        ["Indigo Upset", "Jordan Crown", 210, -250],
        ["Kai Unknown", "Logan Mystery", null, null],
      ] as const;
      for (const [index, [nameA, nameB, oddsA, oddsB]] of pairs.entries()) {
        const fighterAId = `local-fighter-${index}-a`;
        const fighterBId = `local-fighter-${index}-b`;
        for (const [id, name] of [[fighterAId, nameA], [fighterBId, nameB]]) {
          await tx.fighter.upsert({ where: { id }, create: { id, name: `LOCAL DEMO ${name}`, record: "10-2-0" }, update: {} });
        }
        const fight = await tx.fight.upsert({
          where: { id: `local-fight-${index}` },
          create: { id: `local-fight-${index}`, eventId: "local-fantasy-event", order: index + 1, fighterAId, fighterBId, weightClass: "Local Demo Bout", ...fightOddsData(oddsA, oddsB) },
          update: {},
        });
        await tx.fightResult.upsert({ where: { fightId: fight.id }, create: { fightId: fight.id, status: "PENDING" }, update: {} });
      }
    });
    console.log("Seeded 2 demo users and 6 fictional fights, including +100, underdog, favourite, and missing-odds cases.");
    console.log("Existing demo lineups/results are preserved. Re-running setup reopens the demo event for another day.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
