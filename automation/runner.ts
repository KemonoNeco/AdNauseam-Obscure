import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium, type BrowserContext } from "playwright-core";
import {
  defaultBraveExecutableCandidates,
  defaultBraveUserDataDirCandidates,
  defaultConfig,
  type RunConfig
} from "./config.js";
import { mulberry32, randomInt } from "./humanize.js";
import { buildQuerySource } from "./queryGenerator.js";
import { runShoppingSession } from "./shoppingSession.js";

type ArgMap = Record<string, string | boolean | number | undefined>;

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {};
  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i]!;
    if (!cur.startsWith("--")) continue;
    const eq = cur.indexOf("=");
    if (eq !== -1) {
      const key = cur.slice(2, eq);
      const val = cur.slice(eq + 1);
      out[key] = val;
      continue;
    }
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i++;
  }
  return out;
}

function coerceBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
  }
  return fallback;
}

function coerceInt(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.X_OK | fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function pickFirstExisting(candidates: string[]): Promise<string | undefined> {
  for (const c of candidates) {
    if (await pathExists(c)) return c;
  }
  return undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function log(event: string, data: Record<string, unknown> = {}): void {
  // JSONL style for easy parsing
  console.log(JSON.stringify({ t: nowIso(), event, ...data }));
}

async function launchBravePersistent(config: RunConfig): Promise<BrowserContext> {
  const args: string[] = [
    `--profile-directory=${config.braveProfileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=TranslateUI",
    "--disable-blink-features=AutomationControlled"
  ];

  log("launch", {
    braveExecutablePath: config.braveExecutablePath,
    braveUserDataDir: config.braveUserDataDir,
    braveProfileDirectory: config.braveProfileDirectory,
    headless: config.headless,
    locale: config.locale
  });

  return await chromium.launchPersistentContext(config.braveUserDataDir, {
    executablePath: config.braveExecutablePath,
    headless: config.headless,
    args,
    // Playwright disables extensions by default; we must remove that so Brave loads
    // the user's profile extensions (e.g., AdNauseam).
    // Also remove --enable-automation (strong bot signal); we use our own more conservative args.
    ignoreDefaultArgs: [
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--enable-automation"
    ],
    viewport: { width: 1280, height: 800 },
    locale: config.locale
  });
}

async function cleanSingletons(userDataDir: string): Promise<void> {
  const names = ["SingletonLock", "SingletonSocket", "SingletonCookie"] as const;
  await Promise.all(
    names.map(async (name) => {
      const p = path.join(userDataDir, name);
      try {
        await fs.promises.unlink(p);
      } catch {
        // ignore
      }
    })
  );
}

function usage(): string {
  return [
    "Usage:",
    "  npm run shop:browse -- --brave /usr/bin/brave-browser --user-data-dir ~/.config/BraveSoftware/Brave-Browser [options]",
    "",
    "Required:",
    "  --brave PATH               Brave executable path",
    "  --user-data-dir PATH       Brave user data dir (contains 'Default/', 'Profile 1/', etc)",
    "",
    "Optional:",
    "  --profile NAME             Profile directory (default: Default)",
    "  --headless true|false      Default: false",
    "  --locale en-US             Default: en-US",
    "  --clean-singletons true    Remove stale Singleton* files (ONLY use on copied profiles). Default: false",
    "  --max-queries N            Default: 10",
    "  --seed-file PATH           Optional text file with one seed phrase per line",
    "  --log-visited-urls true    Default: false",
    "",
    "Browse behavior:",
    "  --max-pages-per-query N        Default: 2",
    "  --max-product-opens-per-query N Default: 2",
    "  --max-scrolls-per-page N       Default: 8",
    "  --min-dwell-ms N               Default: 6000",
    "  --max-dwell-ms N               Default: 18000",
    "  --min-between-queries-ms N     Default: 7000",
    "  --max-between-queries-ms N     Default: 20000"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    process.exit(0);
  }

  const config = defaultConfig();
  config.braveExecutablePath = String(args.brave ?? "");
  config.braveUserDataDir = String(args["user-data-dir"] ?? "");
  config.braveProfileDirectory = String(args.profile ?? config.braveProfileDirectory);
  config.headless = coerceBool(args.headless, config.headless);
  config.locale = String(args.locale ?? config.locale);
  config.cleanSingletons = coerceBool(args["clean-singletons"], config.cleanSingletons);
  config.maxQueries = coerceInt(args["max-queries"], config.maxQueries);
  if (typeof args["seed-file"] === "string") {
    config.seedFile = args["seed-file"];
  } else {
    delete config.seedFile;
  }
  config.logVisitedUrls = coerceBool(args["log-visited-urls"], config.logVisitedUrls);
  config.maxPagesPerQuery = coerceInt(args["max-pages-per-query"], config.maxPagesPerQuery);
  config.maxProductOpensPerQuery = coerceInt(
    args["max-product-opens-per-query"],
    config.maxProductOpensPerQuery
  );
  config.maxScrollsPerPage = coerceInt(args["max-scrolls-per-page"], config.maxScrollsPerPage);
  config.minDwellMs = coerceInt(args["min-dwell-ms"], config.minDwellMs);
  config.maxDwellMs = coerceInt(args["max-dwell-ms"], config.maxDwellMs);
  config.minBetweenQueriesMs = coerceInt(args["min-between-queries-ms"], config.minBetweenQueriesMs);
  config.maxBetweenQueriesMs = coerceInt(args["max-between-queries-ms"], config.maxBetweenQueriesMs);

  if (!config.braveExecutablePath) {
    const detected = await pickFirstExisting(defaultBraveExecutableCandidates());
    if (detected) config.braveExecutablePath = detected;
  }
  if (!config.braveUserDataDir) {
    const detected = await pickFirstExisting(defaultBraveUserDataDirCandidates());
    if (detected) config.braveUserDataDir = detected;
  }

  if (!config.braveExecutablePath || !config.braveUserDataDir) {
    console.error("Missing required --brave and/or --user-data-dir");
    console.error("");
    console.error(usage());
    process.exit(2);
  }

  // Optional: expand ~
  config.braveUserDataDir = config.braveUserDataDir.startsWith("~")
    ? path.join(process.env.HOME ?? "", config.braveUserDataDir.slice(1))
    : config.braveUserDataDir;
  config.braveExecutablePath = config.braveExecutablePath.startsWith("~")
    ? path.join(process.env.HOME ?? "", config.braveExecutablePath.slice(1))
    : config.braveExecutablePath;
  if (config.seedFile?.startsWith("~")) {
    config.seedFile = path.join(process.env.HOME ?? "", config.seedFile.slice(1));
  }

  if (config.cleanSingletons) {
    await cleanSingletons(config.braveUserDataDir);
  }

  const seed = Date.now() ^ randomInt(mulberry32(Date.now()), 1, 1_000_000_000);
  const rng = mulberry32(seed);
  log("seed", { seed });

  const querySource = await buildQuerySource(config.seedFile ? { seedFile: config.seedFile } : {}, rng);

  const context = await launchBravePersistent(config);
  try {
    await runShoppingSession(context, config, querySource, rng);
  } finally {
    await context.close();
  }

  log("done", {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


