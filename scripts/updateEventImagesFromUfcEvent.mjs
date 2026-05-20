import "dotenv/config";
import { chromium } from "playwright";
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

const EVENT_URL = process.argv[2] || "https://www.ufc.com/event/ufc-328";
const DRY_RUN = false;

function clean(value) {
  return value?.replace(/\s+/g, " ").trim() || null;
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

function centerX(rect) {
  return rect.x + rect.width / 2;
}

function centerY(rect) {
  return rect.y + rect.height / 2;
}

function rectDistance(a, b) {
  return Math.hypot(centerX(a) - centerX(b), centerY(a) - centerY(b));
}

function isFlagCandidate(image) {
  const url = String(image.url || "").toLowerCase();
  const alt = String(image.alt || "").toLowerCase();
  const className = String(image.className || "").toLowerCase();

  const ratio = image.width && image.height ? image.width / image.height : null;

  const smallish =
    image.area < 12000 ||
    (image.width && image.width <= 140) ||
    (image.height && image.height <= 90);

  return (
    url.includes("flag") ||
    url.includes("/flags/") ||
    url.includes("country") ||
    alt.includes("flag") ||
    alt.includes("country") ||
    className.includes("flag") ||
    className.includes("country") ||
    (smallish && ratio !== null && ratio > 1.2 && ratio < 2.7)
  );
}

function isBadFighterImage(image) {
  const url = String(image.url || "").toLowerCase();

  return (
    !url ||
    isFlagCandidate(image) ||
    url.includes("icon") ||
    url.includes("logo") ||
    url.includes("placeholder") ||
    url.endsWith(".svg")
  );
}

function scoreFighterImage(image, fighterName) {
  if (isBadFighterImage(image)) return -9999;

  const url = image.url;
  const normalizedUrl = stripAccents(url).toUpperCase();
  const tokens = getNameTokens(fighterName);

  let score = 0;

  for (const token of tokens) {
    if (normalizedUrl.includes(token)) {
      score += 90;
    }
  }

  // Prefer event-page images.
  if (url.includes("/images/20")) score += 70;
  if (!url.includes("/images/styles/")) score += 50;

  // Avoid individual profile-page images.
  if (url.includes("/images/styles/athlete_bio_full_body/")) score -= 100;
  if (url.includes("/images/styles/")) score -= 60;

  if (url.toLowerCase().includes(".png")) score += 10;
  if (normalizedUrl.includes("BELT")) score += 25;

  return score;
}

function pickBestFighterImage(fighter) {
  const ranked = fighter.images
    .map((image) => ({
      ...image,
      score: scoreFighterImage(image, fighter.name),
    }))
    .filter((image) => image.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.url || null;
}

function pickBestCountryFlag(fighter) {
  const flags = fighter.images.filter(isFlagCandidate);

  if (flags.length === 0) return null;

  const fightCenterX = centerX(fighter.fightRect);
  const fighterCenterX = centerX(fighter.anchorRect);
  const fighterIsLeft = fighterCenterX < fightCenterX;

  const sameSideFlags = flags.filter((flag) => {
    const flagIsLeft = centerX(flag.rect) < fightCenterX;
    return flagIsLeft === fighterIsLeft;
  });

  const candidates = sameSideFlags.length > 0 ? sameSideFlags : flags;

  const ranked = candidates
    .map((flag) => ({
      ...flag,
      distance: rectDistance(flag.rect, fighter.anchorRect),
    }))
    .sort((a, b) => a.distance - b.distance);

  return ranked[0]?.url || null;
}

async function acceptCookies(page) {
  const attempts = [
    () =>
      page
        .getByRole("button", { name: /accept all/i })
        .click({ timeout: 1500 }),
    () =>
      page.getByRole("button", { name: /accept/i }).click({ timeout: 1500 }),
    () => page.getByRole("button", { name: /agree/i }).click({ timeout: 1500 }),
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // no cookie banner
    }
  }
}

async function scrapeEventPageImages(page, eventUrl) {
  await page.goto(eventUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await acceptCookies(page);

  return page.evaluate(() => {
    const clean = (value) => value?.replace(/\s+/g, " ").trim() || null;

    const abs = (url) => {
      if (!url) return null;

      try {
        return new URL(url, window.location.href).toString();
      } catch {
        return null;
      }
    };

    const parseSrcset = (srcset) => {
      if (!srcset) return null;

      const first = srcset.split(",")[0]?.trim();
      return first?.split(/\s+/)[0] || null;
    };

    const rectToObject = (rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });

    const imageToCandidate = (img) => {
      const rawUrl =
        img.currentSrc ||
        img.getAttribute("src") ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        parseSrcset(img.getAttribute("srcset")) ||
        parseSrcset(img.getAttribute("data-srcset"));

      const url = abs(rawUrl);

      if (!url) return null;

      const rect = img.getBoundingClientRect();

      return {
        url,
        alt: img.getAttribute("alt") || "",
        className: typeof img.className === "string" ? img.className : "",
        width: img.naturalWidth || img.width || rect.width || null,
        height: img.naturalHeight || img.height || rect.height || null,
        area: rect.width * rect.height,
        rect: rectToObject(rect),
      };
    };

    const collectImages = (root) => {
      if (!root) return [];

      const seen = new Set();

      return Array.from(root.querySelectorAll("img"))
        .map(imageToCandidate)
        .filter(Boolean)
        .filter((image) => {
          if (seen.has(image.url)) return false;
          seen.add(image.url);
          return true;
        });
    };

    const slugToName = (url) => {
      const slug = url.split("/").filter(Boolean).pop() || "";

      return slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    };

    const fightLikeNodes = Array.from(
      document.querySelectorAll(
        [
          ".c-listing-fight",
          "[class*='listing-fight']",
          "[data-fight-id]",
          "[class*='bout']",
        ].join(","),
      ),
    );

    const candidateFightNodes = fightLikeNodes.filter((node) => {
      const athleteLinks = Array.from(
        node.querySelectorAll('a[href*="/athlete/"]'),
      );

      const uniqueAthletes = new Set(
        athleteLinks
          .map((anchor) => abs(anchor.getAttribute("href")))
          .filter(Boolean),
      );

      return uniqueAthletes.size >= 2 && uniqueAthletes.size <= 4;
    });

    const fightNodes = candidateFightNodes.filter((node) => {
      return !candidateFightNodes.some(
        (other) => other !== node && node.contains(other),
      );
    });

    const fighters = [];

    for (const fightNode of fightNodes) {
      const fightRect = rectToObject(fightNode.getBoundingClientRect());
      const fightImages = collectImages(fightNode);

      const athleteLinks = Array.from(
        fightNode.querySelectorAll('a[href*="/athlete/"]'),
      );

      const seenProfiles = new Set();

      for (const link of athleteLinks) {
        const profileUrl = abs(link.getAttribute("href"));
        if (!profileUrl || seenProfiles.has(profileUrl)) continue;

        seenProfiles.add(profileUrl);

        let name = clean(link.textContent);

        if (!name || name.length > 80) {
          name = slugToName(profileUrl);
        }

        const anchorRect = rectToObject(link.getBoundingClientRect());

        fighters.push({
          name,
          profileUrl,
          fightRect,
          anchorRect,
          images: fightImages,
        });
      }
    }

    return fighters;
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1400,
      },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    });

    const scrapedFighters = await scrapeEventPageImages(page, EVENT_URL);

    console.log(`Scraped ${scrapedFighters.length} fighters from ${EVENT_URL}`);
    console.log(DRY_RUN ? "DRY RUN: no DB changes will be made.\n" : "");

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const scrapedFighter of scrapedFighters) {
      const name = clean(scrapedFighter.name);

      if (!name) {
        skipped++;
        continue;
      }

      const fighterImageUrl = pickBestFighterImage(scrapedFighter);
      const countryFlagUrl = pickBestCountryFlag(scrapedFighter);

      if (!fighterImageUrl && !countryFlagUrl) {
        skipped++;
        console.log(`No usable images for: ${name}`);
        continue;
      }

      const existingFighter = await prisma.fighter.findFirst({
        where: {
          name,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!existingFighter) {
        notFound++;
        console.log(`NOT FOUND in DB: ${name}`);
        continue;
      }

      const data = {};

      if (fighterImageUrl) {
        data.imageUrl = fighterImageUrl;
      }

      if (countryFlagUrl) {
        data.countryFlagUrl = countryFlagUrl;
      }

      console.log(`Updating ${existingFighter.name}`);
      console.log(data);

      if (!DRY_RUN) {
        await prisma.fighter.update({
          where: {
            id: existingFighter.id,
          },
          data,
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
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
