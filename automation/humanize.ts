export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  if (max < min) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomChoice<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("randomChoice: empty array");
  return items[Math.floor(rng() * items.length)]!;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function jitter(rng: Rng, minMs: number, maxMs: number): Promise<void> {
  await sleep(randomInt(rng, minMs, maxMs));
}

export async function typeLikeHuman(
  page: { type: (selector: string, text: string, options?: { delay?: number }) => Promise<void> },
  selector: string,
  text: string,
  rng: Rng
): Promise<void> {
  const perCharDelay = randomInt(rng, 30, 120);
  await page.type(selector, text, { delay: perCharDelay });
}

export async function humanScroll(
  page: { mouse: { wheel: (dx: number, dy: number) => Promise<void> } },
  rng: Rng,
  steps: number
): Promise<void> {
  for (let i = 0; i < steps; i++) {
    const dy = randomInt(rng, 320, 980);
    await page.mouse.wheel(0, dy);
    await jitter(rng, 250, 900);
  }
}





