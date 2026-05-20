import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const START_URL = "https://www.ufc.com/events";

type Fighter = {
  name: string | null;
  profileUrl: string | null;
  record: string | null;
  imageUrl: string | null;
};

type Fight = {
  order: number;
  weightClass: string | null;
  status: string | null;
  redCorner: Fighter | null;
  blueCorner: Fighter | null;
  rawText: string | null;
};

type UfcEventJson = {
  scrapedAt: string;
  sourceUrl: string;
  event: {
    name: string | null;
    dateText: string | null;
    locationText: string | null;
  };
  fights: Fight[];
};

function clean(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function slugToName(url: string) {
  const slug = url.split("/").filter(Boolean).pop() || "";
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function acceptCookies(page: Page) {
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
      // Ignore if no cookie banner exists.
    }
  }
}

async function getFirstUpcomingEventUrl(page: Page) {
  await page.goto(START_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await acceptCookies(page);

  // Some UFC pages expose an Upcoming tab/link. If it exists, click it.
  await page
    .getByRole("link", { name: /upcoming/i })
    .click({ timeout: 2500 })
    .catch(async () => {
      await page
        .getByRole("button", { name: /upcoming/i })
        .click({ timeout: 2500 })
        .catch(() => {});
    });

  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});

  const links = page.locator('a[href*="/event/"]');
  const count = await links.count();
  const seen = new Set<string>();

  for (let i = 0; i < Math.min(count, 120); i++) {
    const link = links.nth(i);

    const isVisible = await link.isVisible().catch(() => false);
    if (!isVisible) continue;

    const href = await link.getAttribute("href");
    if (!href) continue;

    const url = new URL(href, START_URL).toString();
    const { pathname } = new URL(url);

    if (!pathname.startsWith("/event/")) continue;
    if (pathname === "/event/") continue;
    if (seen.has(url)) continue;

    seen.add(url);
    return url;
  }

  throw new Error("Could not find an upcoming UFC event link.");
}

async function scrapeEventPage(
  page: Page,
  eventUrl: string,
): Promise<UfcEventJson> {
  await page.goto(eventUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});
  await acceptCookies(page);

  return await page.evaluate(() => {
    const clean = (value?: string | null) =>
      value?.replace(/\s+/g, " ").trim() || null;

    const abs = (url?: string | null) => {
      if (!url) return null;
      try {
        return new URL(url, window.location.href).toString();
      } catch {
        return null;
      }
    };

    const pickText = (selectors: string[]) => {
      for (const selector of selectors) {
        const text = clean(document.querySelector(selector)?.textContent);
        if (text) return text;
      }
      return null;
    };

    const pickShortTextByClass = (
      root: Element,
      classIncludes: string[],
      maxLength = 80,
    ) => {
      const els = Array.from(root.querySelectorAll("*"));

      for (const el of els) {
        const className =
          typeof (el as HTMLElement).className === "string"
            ? (el as HTMLElement).className.toLowerCase()
            : "";

        const matches = classIncludes.every((part) =>
          className.includes(part.toLowerCase()),
        );

        if (!matches) continue;

        const text = clean(el.textContent);
        if (text && text.length <= maxLength) return text;
      }

      return null;
    };

    const recordFromText = (text: string | null) => {
      if (!text) return null;
      return text.match(/\b\d{1,2}-\d{1,2}(?:-\d{1,2})?\b/)?.[0] || null;
    };

    const eventName = pickText([
      "h1",
      ".c-hero__headline",
      ".hero-profile__name",
      "[data-testid='event-title']",
    ]);

    const dateText = pickText([
      "time",
      ".c-hero__headline-suffix",
      ".c-event-details__date",
      "[class*='date']",
    ]);

    const locationText = pickText([
      ".c-event-details__venue",
      ".c-event-details__location",
      "[class*='venue']",
      "[class*='location']",
    ]);

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
      ) as HTMLAnchorElement[];

      const uniqueAthletes = new Set(
        athleteLinks.map((a) => abs(a.getAttribute("href"))),
      );

      return uniqueAthletes.size >= 2 && uniqueAthletes.size <= 4;
    });

    // Prefer smallest useful nodes to avoid scraping the whole card container repeatedly.
    const fightNodes = candidateFightNodes.filter((node) => {
      return !candidateFightNodes.some(
        (other) => other !== node && node.contains(other),
      );
    });

    const fights = fightNodes.map((node, index) => {
      const athleteAnchors = Array.from(
        node.querySelectorAll('a[href*="/athlete/"]'),
      ) as HTMLAnchorElement[];

      const fighters: Fighter[] = [];
      const seen = new Set<string>();

      for (const anchor of athleteAnchors) {
        const profileUrl = abs(anchor.getAttribute("href"));
        if (!profileUrl || seen.has(profileUrl)) continue;

        seen.add(profileUrl);

        const wrapper =
          anchor.closest(
            "[class*='corner'], [class*='fighter'], [class*='athlete']",
          ) || anchor.parentElement;

        let name = clean(anchor.textContent);

        if (!name || name.length > 80) {
          name = slugToName(profileUrl);
        }

        const wrapperText = clean(wrapper?.textContent);
        const record =
          pickShortTextByClass(wrapper || node, ["record"], 40) ||
          recordFromText(wrapperText);

        const img =
          (wrapper?.querySelector("img") as HTMLImageElement | null)?.src ||
          null;

        fighters.push({
          name,
          profileUrl,
          record,
          imageUrl: img,
        });
      }

      const weightClass =
        pickShortTextByClass(node, ["class"], 80) ||
        pickShortTextByClass(node, ["weight"], 80) ||
        null;

      const status =
        pickShortTextByClass(node, ["status"], 80) ||
        pickShortTextByClass(node, ["round"], 80) ||
        null;

      return {
        order: index + 1,
        weightClass,
        status,
        redCorner: fighters[0] || null,
        blueCorner: fighters[1] || null,
        rawText: clean(node.textContent),
      };
    });

    return {
      scrapedAt: new Date().toISOString(),
      sourceUrl: window.location.href,
      event: {
        name: eventName,
        dateText,
        locationText,
      },
      fights,
    };
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    });

    const eventUrl = await getFirstUpcomingEventUrl(page);
    const json = await scrapeEventPage(page, eventUrl);

    await mkdir(path.join(process.cwd(), "data"), { recursive: true });

    const outputPath = path.join(process.cwd(), "data", "ufc-next-card.json");

    await writeFile(outputPath, JSON.stringify(json, null, 2), "utf8");

    console.log(JSON.stringify(json, null, 2));
    console.log(`\nSaved to ${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
