import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from your .env file.");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

/**
 * false = actually updates Neon
 * true = preview only
 */
const DRY_RUN = false;

const JSON_FILE = "ufc_fighters.json";

function cleanString(value) {
  if (value === undefined || value === null) return undefined;

  const cleaned = String(value).trim();

  if (cleaned.length === 0) return undefined;

  // Prevent scraper garbage from being saved.
  if (cleaned.toLowerCase().includes("xml version")) return undefined;

  return cleaned;
}

function cleanLastFight(value) {
  const cleaned = cleanString(value);

  if (!cleaned) return undefined;

  // Only save legit UFC-looking event names.
  if (!cleaned.toLowerCase().includes("ufc")) return undefined;

  return cleaned;
}

function cleanInt(value) {
  if (value === undefined || value === null || value === "") return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function cleanRanking(value) {
  return cleanInt(value);
}

function stripAccents(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getNameTokens(name) {
  return stripAccents(name)
    .toUpperCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Z]/g, ""))
    .filter(Boolean);
}

function getAllImageCandidates(fighter) {
  const candidates = [
    ...(Array.isArray(fighter.images) ? fighter.images : []),
    fighter.imageUrl,
  ]
    .map((image) => cleanString(image))
    .filter(Boolean);

  return [...new Set(candidates)];
}

function isFlagImageUrl(url) {
  const lower = String(url || "").toLowerCase();

  return (
    lower.includes("flag") ||
    lower.includes("/flags/") ||
    lower.includes("country")
  );
}

function isBadFighterImageUrl(url) {
  const lower = String(url || "").toLowerCase();

  return (
    !lower ||
    isFlagImageUrl(url) ||
    lower.includes("icon") ||
    lower.includes("logo") ||
    lower.includes("placeholder") ||
    lower.endsWith(".svg")
  );
}

function imageMatchesFighterName(url, fighterName) {
  const normalizedUrl = stripAccents(url).toUpperCase();
  const tokens = getNameTokens(fighterName);

  return tokens.some((token) => normalizedUrl.includes(token));
}

function scoreFighterImageUrl(url, fighterName) {
  if (!url || isBadFighterImageUrl(url)) return -9999;

  const normalizedUrl = stripAccents(url).toUpperCase();
  const tokens = getNameTokens(fighterName);

  let score = 0;

  // Strongest signal: URL contains fighter name pieces.
  // Example: CHIMAEV_KHAMZAT, STRICKLAND_SEAN, VAN_JOSHUA
  for (const token of tokens) {
    if (normalizedUrl.includes(token)) {
      score += 60;
    }
  }

  // Prefer the old event-card images from main.py:
  // https://ufc.com/images/2025-08/CHIMAEV_KHAMZAT_BELTMOCK.png
  if (url.includes("/images/20")) score += 40;
  if (!url.includes("/images/styles/")) score += 35;

  // Still allow profile images, but make them lower priority.
  if (url.includes("/images/styles/athlete_bio_full_body/")) score += 5;

  if (url.toLowerCase().includes(".png")) score += 10;
  if (url.toLowerCase().includes(".jpg")) score += 5;
  if (url.toLowerCase().includes(".jpeg")) score += 5;

  // Champ images often contain BELT or BELTMOCK.
  // Keep them preferred because your UI detects champion from this.
  if (normalizedUrl.includes("BELT")) score += 20;

  return score;
}

function getFighterImageUrl(fighter) {
  const eventImageUrl = cleanString(fighter.eventImageUrl);

  if (eventImageUrl && !isBadFighterImageUrl(eventImageUrl)) {
    return eventImageUrl;
  }

  const candidates = getAllImageCandidates(fighter);

  const ranked = candidates
    .map((url) => ({
      url,
      score: scoreFighterImageUrl(url, fighter.name),
      matchesName: imageMatchesFighterName(url, fighter.name),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best) {
    console.log(`No good fighter image found for: ${fighter.name}`);
    return undefined;
  }

  return best.url;
}

function getCountryFlagUrl(fighter) {
  const countryFlagUrl = cleanString(fighter.countryFlagUrl);

  if (countryFlagUrl && isFlagImageUrl(countryFlagUrl)) {
    return countryFlagUrl;
  }

  const eventCountryFlagUrl = cleanString(fighter.eventCountryFlagUrl);

  if (eventCountryFlagUrl && isFlagImageUrl(eventCountryFlagUrl)) {
    return eventCountryFlagUrl;
  }

  const candidates = getAllImageCandidates(fighter);

  const flag = candidates.find((url) => isFlagImageUrl(url));

  if (!flag) {
    return undefined;
  }

  return flag;
}

function buildUpdateData(fighter) {
  return {
    nickname: cleanString(fighter.nickname),
    imageUrl: getFighterImageUrl(fighter),
    countryFlagUrl: getCountryFlagUrl(fighter),
    ranking: cleanRanking(fighter.ranking),
    country: cleanString(fighter.country),
    record: cleanString(fighter.record),
    lastFight: cleanLastFight(fighter.lastFight),
    age: cleanInt(fighter.age),
    height: cleanString(fighter.height),
    reach: cleanString(fighter.reach),
    winsByKo: cleanInt(fighter.winsByKo),
    winsBySub: cleanInt(fighter.winsBySub),
    winsByDec: cleanInt(fighter.winsByDec),
  };
}

function removeUndefinedFields(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

async function main() {
  const jsonPath = path.join(process.cwd(), JSON_FILE);
  const raw = fs.readFileSync(jsonPath, "utf8");
  const scrapedFighters = JSON.parse(raw);

  if (!Array.isArray(scrapedFighters)) {
    throw new Error(`${JSON_FILE} must be a JSON array.`);
  }

  console.log(`Loaded ${scrapedFighters.length} fighters from ${JSON_FILE}`);
  console.log(DRY_RUN ? "DRY RUN: no database changes will be made.\n" : "");

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const scrapedFighter of scrapedFighters) {
    const name = cleanString(scrapedFighter.name);

    if (!name) {
      skipped++;
      console.log("Skipping fighter with no name:", scrapedFighter);
      continue;
    }

    const existingFighter = await prisma.fighter.findFirst({
      where: {
        name,
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        countryFlagUrl: true,
      },
    });

    if (!existingFighter) {
      const createData = removeUndefinedFields({
        name,
        ...buildUpdateData(scrapedFighter),
      });

      console.log(`Creating: ${name}`);
      console.log(createData);

      if (!DRY_RUN) {
        await prisma.fighter.create({
          data: createData,
        });
      }

      updated++;
      continue;
    }

    const updateData = removeUndefinedFields(buildUpdateData(scrapedFighter));

    if (Object.keys(updateData).length === 0) {
      skipped++;
      console.log(`No new data for: ${name}`);
      continue;
    }

    console.log(`Updating: ${existingFighter.name}`);
    console.log(updateData);

    if (!DRY_RUN) {
      await prisma.fighter.update({
        where: {
          id: existingFighter.id,
        },
        data: updateData,
      });
    }

    updated++;
  }

  console.log("\nDone.");
  console.log({
    updated,
    skipped,
    notFound,
    dryRun: DRY_RUN,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
