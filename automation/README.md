# Google Shopping browse automation (Brave + Playwright)

This folder contains a small Playwright runner that launches **Brave with your existing profile** (extensions enabled) and performs **browse-only** randomized Google Shopping sessions:
- Generates commerce-heavy queries
- Opens Google Shopping results
- Scrolls/paginates with human-like pacing
- Optionally opens a couple product detail pages
- **Does not click ads** and does not extract/store product listing data

## Prerequisites
- Node.js 18+ (you have Node installed)
- Brave installed at `/usr/bin/brave` (detected on your system)

Install deps:

```bash
cd "/home/kemononeco/Projects/AdNauseam Obscure"
npm install
```

## Running

### Default: use your live Brave profile (close Brave first)
If Brave is open, Playwright will refuse to launch this profile (to avoid corruption). Close Brave (all windows) first, then run:

```bash
npm run shop:browse -- \
  --brave /usr/bin/brave \
  --user-data-dir "$HOME/.config/BraveSoftware/Brave-Browser" \
  --profile Default \
  --max-queries 5
```

## Seeding queries (optional)
You can bias the generator with a seed file (one phrase per line; `#` comments allowed):

```bash
npm run shop:browse -- \
  --brave /usr/bin/brave \
  --user-data-dir "$HOME/.config/BraveSoftware/Brave-Browser" \
  --profile Default \
  --seed-file ./automation/seeds.example.txt
```

## Output/logging
The runner prints JSON lines to stdout:
- `launch`, `seed`, `query_start`, `query_end`, `query_error`, `done`

If you want to log navigated URLs for debugging:

```bash
--log-visited-urls true
```

## Troubleshooting
- **Profile is already in use**: close Brave completely, then retry.
- **Captcha / unusual traffic**: the runner stops when it detects likely blocks. Reduce `--max-queries`, add longer dwell times, and run less frequently.


