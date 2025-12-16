export type Locale = `${string}-${string}` | string;

export type RunConfig = {
  braveExecutablePath: string;
  braveUserDataDir: string;
  braveProfileDirectory: string;
  headless: boolean;
  locale: Locale;
  cleanSingletons: boolean;
  maxQueries: number;
  minDwellMs: number;
  maxDwellMs: number;
  minBetweenQueriesMs: number;
  maxBetweenQueriesMs: number;
  maxProductOpensPerQuery: number;
  maxScrollsPerPage: number;
  maxPagesPerQuery: number;
  seedFile?: string;
  logVisitedUrls: boolean;
};

export function defaultBraveExecutableCandidates(): string[] {
  return [
    process.env.BRAVE_BIN,
    "/usr/bin/brave-browser",
    "/usr/bin/brave",
    "/usr/bin/brave-browser-stable",
    "/opt/brave.com/brave/brave"
  ].filter((x): x is string => Boolean(x));
}

export function defaultBraveUserDataDirCandidates(): string[] {
  const home = process.env.HOME;
  if (!home) return [];
  return [
    `${home}/.config/BraveSoftware/Brave-Browser`,
    `${home}/.config/BraveSoftware/Brave-Browser-Beta`,
    `${home}/.config/BraveSoftware/Brave-Browser-Nightly`
  ];
}

export function defaultConfig(): RunConfig {
  return {
    braveExecutablePath: "",
    braveUserDataDir: "",
    braveProfileDirectory: "Default",
    headless: false,
    locale: "en-US",
    cleanSingletons: false,
    maxQueries: 100,
    minDwellMs: 1_000,
    maxDwellMs: 5_000,
    minBetweenQueriesMs: 7_000,
    maxBetweenQueriesMs: 15_000,
    maxProductOpensPerQuery: 2,
    maxScrollsPerPage: 8,
    maxPagesPerQuery: 2,
    logVisitedUrls: false
  };
}


