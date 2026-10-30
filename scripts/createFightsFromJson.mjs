import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { fightOddsData } from "../lib/fight-odds.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from your .env file.");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const EVENT_SLUG = process.argv[2];
const SHOULD_REPLACE = process.argv.includes("--replace");
const JSON_FILE = "ufc_fighters.json";

if (!EVENT_SLUG) {
  throw new Error(
    "Missing event slug. Example: node scripts/createFightsFromJson.mjs ufc-329",
  );
}

function cleanString(value) {
  if (value === undefined || value === null) return "";

  return String(value).replace(/\s+/g, " ").trim();
}

async function main() {
  const jsonPath = path.join(process.cwd(), JSON_FILE);
  const raw = fs.readFileSync(jsonPath, "utf8");
  const fightersJson = JSON.parse(raw);

  if (!Array.isArray(fightersJson)) {
    throw new Error(`${JSON_FILE} must be a JSON array.`);
  }

  if (fightersJson.length % 2 !== 0) {
    throw new Error(
      `${JSON_FILE} has an odd number of fighters. Cannot pair fights cleanly.`,
    );
  }

  const event = await prisma.event.findUnique({
    where: {
      slug: EVENT_SLUG,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      isActive: true,
      fights: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!event) {
    throw new Error(`Event not found with slug: ${EVENT_SLUG}`);
  }

  console.log(`Event found: ${event.name}`);
  console.log({
    id: event.id,
    slug: event.slug,
    status: event.status,
    isActive: event.isActive,
    existingFights: event.fights.length,
  });

  if (event.fights.length > 0 && !SHOULD_REPLACE) {
    throw new Error(
      `This event already has ${event.fights.length} fights. Add --replace if you want to delete and recreate them.`,
    );
  }

  const pairs = [];

  for (let index = 0; index < fightersJson.length; index += 2) {
    const fighterAName = cleanString(fightersJson[index]?.name);
    const fighterBName = cleanString(fightersJson[index + 1]?.name);

    if (!fighterAName || !fighterBName) {
      throw new Error(`Invalid fighter pair at JSON index ${index}.`);
    }

    const fighterA = await prisma.fighter.findFirst({
      where: {
        name: fighterAName,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const fighterB = await prisma.fighter.findFirst({
      where: {
        name: fighterBName,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!fighterA) {
      throw new Error(`Fighter not found in DB: ${fighterAName}`);
    }

    if (!fighterB) {
      throw new Error(`Fighter not found in DB: ${fighterBName}`);
    }

    pairs.push({
      ...fightOddsData(fightersJson[index]?.odds, fightersJson[index + 1]?.odds),
      order: index / 2 + 1,
      fighterA,
      fighterB,
      weightClass:
        cleanString(fightersJson[index]?.weightClass) ||
        cleanString(fightersJson[index + 1]?.weightClass) ||
        null,
    });
  }

  console.log("\nFights to create:");
  for (const pair of pairs) {
    console.log(
      `${pair.order}. ${pair.fighterA.name} vs ${pair.fighterB.name}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`;
    const currentEvent = await tx.event.findUniqueOrThrow({ where: { id: event.id } });
    if (
      !["DRAFT", "OPEN"].includes(currentEvent.status) ||
      currentEvent.lockAt.getTime() <= Date.now()
    ) {
      throw new Error("Cannot import fights after this event has closed.");
    }
    const lineupCount = await tx.fantasyLineup.count({ where: { eventId: event.id } });
    if (lineupCount > 0) {
      throw new Error("Cannot recreate fights or change odds after fantasy lineups have been saved.");
    }
    if (SHOULD_REPLACE && await tx.pickSubmission.count({ where: { eventId: event.id } })) {
      throw new Error("Cannot recreate fights after picks have been submitted.");
    }
    if (!SHOULD_REPLACE && await tx.fight.count({ where: { eventId: event.id } })) {
      throw new Error("This event already has fights. Use --replace only before entries open.");
    }
    if (SHOULD_REPLACE) {
      console.log("\nDeleting existing fights for event...");

      const existingFights = await tx.fight.findMany({
        where: {
          eventId: event.id,
        },
        select: {
          id: true,
        },
      });

      const existingFightIds = existingFights.map((fight) => fight.id);

      if (existingFightIds.length > 0) {
        await tx.fightResult.deleteMany({
          where: {
            fightId: {
              in: existingFightIds,
            },
          },
        });

        await tx.pickChoice.deleteMany({
          where: {
            fightId: {
              in: existingFightIds,
            },
          },
        });

        await tx.fight.deleteMany({
          where: {
            id: {
              in: existingFightIds,
            },
          },
        });
      }
    }

    for (const pair of pairs) {
      await tx.fight.create({
        data: {
          eventId: event.id,
          fighterAId: pair.fighterA.id,
          fighterBId: pair.fighterB.id,
          order: pair.order,
          weightClass: pair.weightClass,
          fighterAOdds: pair.fighterAOdds,
          fighterBOdds: pair.fighterBOdds,
          fighterAIsUnderdog: pair.fighterAIsUnderdog,
          fighterBIsUnderdog: pair.fighterBIsUnderdog,
        },
      });
    }
  });

  console.log("\nDone.");
  console.log(`Created ${pairs.length} fights for ${event.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
