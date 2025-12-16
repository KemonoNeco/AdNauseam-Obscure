import fs from "node:fs";
import { randomChoice, randomInt, type Rng } from "./humanize.js";

export type QuerySource = {
  nextQuery: () => string;
};

type BuildOptions = {
  seedFile?: string;
};

const categories = [
  "wireless earbuds",
  "gaming laptop",
  "4k monitor",
  "robot vacuum",
  "air purifier",
  "standing desk",
  "office chair",
  "running shoes",
  "winter jacket",
  "skin care serum",
  "vitamin d supplement",
  "protein powder",
  "electric toothbrush",
  "blender",
  "espresso machine",
  "smartwatch",
  "phone case",
  "car dash cam",
  "tool set",
  "lego set",
  "mechanical keyboard",
  "noise cancelling headphones",
  "camping tent",
  "hiking backpack",
  "yoga mat",
  "sunscreen",
  "electric scooter",
  "cat food",
  "dog shampoo",
  "air fryer",
  "rice cooker",
  "mattress topper",
  "humidifier",
  "dehumidifier",
  "printer ink",
  "ssd 2tb",
  "router wifi 6e",
  "smart light bulbs",
  "coffee grinder"
] as const;

const adjectives = [
  "best",
  "cheap",
  "premium",
  "budget",
  "top rated",
  "durable",
  "lightweight",
  "waterproof",
  "compact",
  "new",
  "refurbished",
  "eco friendly",
  "quiet",
  "portable",
  "high performance"
] as const;

const intents = [
  "buy",
  "deals",
  "price",
  "sale",
  "discount",
  "free shipping",
  "near me",
  "online",
  "coupon",
  "clearance",
  "bundle",
  "gift",
  "student discount"
] as const;

const brands = [
  "Samsung",
  "Apple",
  "Sony",
  "LG",
  "Dell",
  "HP",
  "Lenovo",
  "Nike",
  "Adidas",
  "Bosch",
  "Philips",
  "Dyson",
  "Logitech",
  "Anker",
  "Asus",
  "Acer",
  "Canon",
  "Nikon",
  "KitchenAid",
  "Cuisinart",
  "Instant Pot",
  "Razer",
  "Corsair",
  "New Balance",
  "Puma"
] as const;

// Unrelated / non-commerce “noise” topics to diversify the query stream.
const topics = [
  "how to make sourdough starter",
  "why do cats knead blankets",
  "history of the silk road",
  "best time to visit iceland",
  "how to learn piano",
  "moon phases calendar",
  "chess opening for beginners",
  "what is photosynthesis",
  "stoicism basics",
  "meditation breathing technique",
  "python list comprehension",
  "linux fish shell tips",
  "how to fix a leaky faucet",
  "volcanoes around the world",
  "recipe for ramen broth",
  "difference between espresso and coffee",
  "how to train for a 5k",
  "minimalist capsule wardrobe",
  "book recommendations sci fi",
  "how to grow basil indoors"
] as const;

const locations = [
  "near me",
  "in tokyo",
  "in berlin",
  "in new york",
  "in london",
  "in san francisco",
  "in sydney",
  "in toronto"
] as const;

function normalizeSeedLine(line: string): string | undefined {
  const s = line.trim();
  if (!s) return undefined;
  if (s.startsWith("#")) return undefined;
  return s;
}

async function loadSeedPhrases(seedFile?: string): Promise<string[]> {
  if (!seedFile) return [];
  try {
    const content = await fs.promises.readFile(seedFile, "utf8");
    return content
      .split(/\r?\n/g)
      .map(normalizeSeedLine)
      .filter((x): x is string => Boolean(x));
  } catch {
    return [];
  }
}

function templateQuery(rng: Rng, seedPhrases: string[]): string {
  const seed = seedPhrases.length ? randomChoice(rng, seedPhrases) : undefined;
  const category = randomChoice(rng, categories);
  const adjective = randomChoice(rng, adjectives);
  const intent = randomChoice(rng, intents);
  const brand = rng() < 0.35 ? randomChoice(rng, brands) : undefined;
  const priceCap =
    rng() < 0.25
      ? `under $${randomChoice(rng, [25, 50, 100, 200, 300, 500, 1000] as const)}`
      : undefined;
  const year = rng() < 0.2 ? `${randomChoice(rng, [2024, 2025] as const)}` : undefined;
  const location = rng() < 0.2 ? randomChoice(rng, locations) : undefined;
  const topic = rng() < 0.35 ? randomChoice(rng, topics) : undefined;

  // Sometimes generate a “weird” mixed query: shopping-ish + unrelated topic fragment.
  // This increases randomness while still having a commerce anchor for tbm=shop.
  const shouldMixUnrelated = rng() < 0.28;
  const unrelatedFragment = shouldMixUnrelated
    ? randomChoice(rng, [
        "for beginners",
        "explained",
        "meaning",
        "tips",
        "checklist",
        "guide",
        "vs",
        "and",
        "ideas"
      ] as const)
    : undefined;

  const patterns = [
    () => `${adjective} ${category} ${year ?? ""}`.trim(),
    () => `${brand ? `${brand} ` : ""}${category} ${intent}`.trim(),
    () => `${category} ${intent} ${priceCap ?? ""}`.trim(),
    () => `${seed ? `${seed} ` : ""}${category} ${intent}`.trim(),
    () => `${adjective} ${brand ? `${brand} ` : ""}${category} ${intent}`.trim(),
    () => `${category} ${intent} ${year ?? ""}`.trim(),
    // “Unrelated noise” patterns (still often include a commerce anchor).
    () =>
      `${category} ${randomChoice(rng, ["why", "how", "what", "when"] as const)} ${topic ?? randomChoice(rng, topics)}`
        .trim()
        .replace(/\s+/g, " "),
    () => `${topic ?? randomChoice(rng, topics)} ${category}`.trim(),
    () => `${category} ${location ?? ""} ${intent}`.trim(),
    () => `${seed ? `${seed} ` : ""}${topic ?? randomChoice(rng, topics)} ${category}`.trim(),
    () =>
      `${adjective} ${category} ${unrelatedFragment ?? ""} ${topic ? ` ${topic}` : ""}`
        .trim()
        .replace(/\s+/g, " "),
    () => {
      const a = randomChoice(rng, categories);
      const b = randomChoice(rng, topics);
      const glue = randomChoice(rng, ["and", "vs", "with", "for"] as const);
      // Example: "air fryer vs moon phases calendar"
      return `${a} ${glue} ${b}`.trim();
    }
  ] as const;

  let q = randomChoice(rng, patterns)();
  // Small chance to add an extra qualifier to enrich variety (some commerce, some generic).
  if (rng() < 0.25) {
    q += ` ${randomChoice(
      rng,
      ["review", "comparison", "specs", "warranty", "setup", "troubleshooting"] as const
    )}`;
  }
  // Small chance to add a random number (sizes / model-ish noise).
  if (rng() < 0.2) {
    q += ` ${randomInt(rng, 2, 128)}`;
  }
  return q.replace(/\s+/g, " ").trim();
}

export async function buildQuerySource(opts: BuildOptions, rng: Rng): Promise<QuerySource> {
  const seedPhrases = await loadSeedPhrases(opts.seedFile);
  return {
    nextQuery: () => templateQuery(rng, seedPhrases)
  };
}


