import type { BrowserContext, Page } from "playwright-core";
import type { RunConfig } from "./config.js";
import type { QuerySource } from "./queryGenerator.js";
import { humanScroll, jitter, randomInt, type Rng } from "./humanize.js";

function nowIso(): string {
  return new Date().toISOString();
}

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: nowIso(), event, ...data }));
}

function getHlFromLocale(locale: string): string {
  const lang = locale.split("-")[0];
  return (lang || "en").toLowerCase();
}

async function isBlocked(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/sorry/")) return true;
  const text = await page
    .locator("body")
    .innerText({ timeout: 3_000 })
    .catch(() => "");
  return /unusual traffic|detected unusual traffic|our systems have detected|to continue, please|not a robot/i.test(
    text
  );
}

async function maybeHandleConsent(page: Page): Promise<void> {
  // Best-effort. Prefer "Reject all" (privacy) if it exists; otherwise accept.
  const reject = page.getByRole("button", { name: /Reject all|Reject|Decline|Deny/i }).first();
  if (await reject.isVisible().catch(() => false)) {
    await reject.click({ timeout: 5_000 }).catch(() => undefined);
    return;
  }
  const accept = page.getByRole("button", { name: /Accept all|I agree|Agree|Accept/i }).first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click({ timeout: 5_000 }).catch(() => undefined);
  }
}

async function openRandomProduct(page: Page, context: BrowserContext, rng: Rng): Promise<boolean> {
  const productLinks = page.locator('a[href*="/shopping/product/"]').filter({ hasNotText: "" });
  const count = await productLinks.count().catch(() => 0);
  if (count <= 0) return false;

  const pickLimit = Math.min(count, 20);
  const idx = randomInt(rng, 0, pickLimit - 1);
  const link = productLinks.nth(idx);

  await link.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  await jitter(rng, 200, 900);

  const popupPromise = context.waitForEvent("page", { timeout: 6_000 }).catch(() => null);
  const navPromise = page
    .waitForNavigation({ timeout: 6_000, waitUntil: "domcontentloaded" })
    .catch(() => null);

  await link.click({ timeout: 6_000, button: "left" }).catch(() => undefined);

  const popup = await popupPromise;
  await navPromise;

  if (popup) {
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    return true;
  }
  // If it navigated in-place, we're on a product-ish page now; return true either way.
  return true;
}

async function returnFromProduct(page: Page, context: BrowserContext): Promise<void> {
  // Prefer closing any popup/tab opened; otherwise go back.
  const pages = context.pages();
  if (pages.length > 1) {
    const newest = pages[pages.length - 1]!;
    if (newest !== page) {
      await newest.close().catch(() => undefined);
      await page.bringToFront().catch(() => undefined);
      return;
    }
  }
  await page.goBack({ timeout: 10_000, waitUntil: "domcontentloaded" }).catch(() => undefined);
}

async function clickNextPageIfPresent(page: Page): Promise<boolean> {
  const next = page.locator('a#pnnext, a[aria-label*="Next"]').first();
  if (!(await next.isVisible().catch(() => false))) return false;
  await Promise.allSettled([
    page.waitForNavigation({ timeout: 10_000, waitUntil: "domcontentloaded" }),
    next.click({ timeout: 5_000 })
  ]);
  return true;
}

async function browseShoppingForQuery(page: Page, context: BrowserContext, config: RunConfig, query: string, rng: Rng) {
  const hl = getHlFromLocale(String(config.locale));
  const url = `https://www.google.com/search?tbm=shop&hl=${encodeURIComponent(hl)}&q=${encodeURIComponent(
    query
  )}`;

  log("query_start", { query, url });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await maybeHandleConsent(page);

  if (await isBlocked(page)) {
    throw new Error("Blocked/captcha detected on Google.");
  }

  const pagesToBrowse = randomInt(rng, 1, Math.max(1, config.maxPagesPerQuery));
  for (let p = 0; p < pagesToBrowse; p++) {
    const scrolls = randomInt(rng, 2, Math.max(2, config.maxScrollsPerPage));
    await humanScroll(page, rng, scrolls);

    const productOpens = randomInt(rng, 0, Math.max(0, config.maxProductOpensPerQuery));
    for (let i = 0; i < productOpens; i++) {
      if (await isBlocked(page)) throw new Error("Blocked/captcha detected on Google.");
      const opened = await openRandomProduct(page, context, rng);
      if (!opened) break;
      await jitter(rng, config.minDwellMs, config.maxDwellMs);
      await returnFromProduct(page, context);
      await jitter(rng, 500, 2_000);
    }

    if (p < pagesToBrowse - 1) {
      const ok = await clickNextPageIfPresent(page);
      if (!ok) break;
      await jitter(rng, 1_000, 4_000);
    }
  }

  await jitter(rng, config.minDwellMs, config.maxDwellMs);
  log("query_end", { query });
}

export async function runShoppingSession(
  context: BrowserContext,
  config: RunConfig,
  querySource: QuerySource,
  rng: Rng
): Promise<void> {
  // Reduce some common automation fingerprints (best-effort).
  await context.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = navigator;
    try {
      Object.defineProperty(nav, "webdriver", { get: () => false });
    } catch {
      // ignore
    }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  if (config.logVisitedUrls) {
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) log("visited", { url: frame.url() });
    });
  }

  for (let i = 0; i < config.maxQueries; i++) {
    const query = querySource.nextQuery();
    try {
      await browseShoppingForQuery(page, context, config, query, rng);
    } catch (err) {
      log("query_error", { query, error: String(err) });
      // Stop on likely captcha/blocks rather than retrying aggressively.
      break;
    }
    await jitter(rng, config.minBetweenQueriesMs, config.maxBetweenQueriesMs);
  }

  await page.close().catch(() => undefined);
}


