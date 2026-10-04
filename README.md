# Flight Proven: a SpaceX fleet tracker

A static website that tracks every SpaceX Falcon 9 and Falcon Heavy booster, every Super Heavy booster and Starship, and every Dragon capsule. It also shows what's in orbit right now. It updates itself every 2 hours from [Launch Library 2](https://thespacedevs.com/llapi) (The Space Devs) and works on desktop and phone.

**Pages**
- **Fleet**: active vehicles by family. Each card shows a generated icon (boosters get sootier as they fly more), flight count, a tally with one tick per flight (landed / landing failed / expended / launch failure), landings, last flight, fastest turnaround, and the next assigned mission.
- **Leaders**: top-10 boards for most reflights, oldest boosters (by first flight), fastest turnaround, most satellites carried, Super Heavy flights and Dragon time in space. You can switch between the active fleet and all time.
- **Archive**: every vehicle ever, including retired, expended and lost ones, with search, family and status filters, and sorting. It renders in batches, so it stays fast at thousands of entries.
- **Vehicle page** (`#/v/b123`): stats (flights, landings, satellites carried, fastest and average turnaround, career span, pads, crew carried, next mission), a turnaround chart, landing-site and destination breakdowns, and a full flight log. Tap a flight to see its date and time, pad, orbit, payload count, mission notes, recovery notes, docking info, the other boosters on the flight, and the webcast link.
- **Next launch**: a countdown to the next flight with its assigned booster, the rest of the manifest (coarse "NET Dec 2026" dates shown as such), then every previous launch, newest first. A Falcon / Starship switch filters this tab, the Fleet and the Leaders.
- **On orbit** (last tab): Dragons, Starships and other SpaceX-launched vehicles in space right now, with live mission-elapsed clocks and docked or free-flying status.

## Set it up on GitHub Pages (about 5 minutes, free)

1. Create a new **public** GitHub repo, for example `flight-proven`, and push this folder to its `main` branch:
   ```bash
   cd spacex-fleet
   git init && git add . && git commit -m "Flight Proven"
   git branch -M main
   git remote add origin https://github.com/<you>/flight-proven.git
   git push -u origin main
   ```
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Go to **Actions → "Update fleet data and deploy" → Run workflow**.

The first run downloads the full launch history (around 13 API calls). If it hits the free API's rate limit (15 requests/hour), it waits or picks up where it stopped on the next scheduled run. After that it runs every 2 hours and makes about 5 calls per run. Your site will be at `https://<you>.github.io/flight-proven/`.

Optional: if you get an API key from The Space Devs (higher rate limits), add it as a repo secret named `LL2_TOKEN`.

## How it stays current

```
GitHub Action (every 2 h)
  └─ scripts/build-data.mjs ──► Launch Library 2
        ├─ new launches (rolling 45-day window, catches corrections)
        ├─ upcoming manifest (booster and ship assignments)
        ├─ spacecraft in space now
        └─ booster roster (new builds, retirements, losses)
  └─ writes data/  ──► commits ──► deploys Pages

Browser
  ├─ loads data/meta.json, fleet.json and orbit.json (small)
  ├─ loads data/launches/<year>.json only for the years a vehicle flew
  └─ makes 1 live API call for anything launched since the last build (cached 30 min)
```

- **Scale**: launches are split into one file per year, and the fleet summary carries only per-vehicle stats. A vehicle page loads only the years that vehicle flew, so the site stays light as the flight count grows into the thousands.
- **New vehicles** show up as soon as LL2 lists them or assigns them to a launch. **Losses and retirements** come from LL2's booster status, which is refreshed every run.
- **Satellites carried** comes from the payload manifest when LL2 has one. Otherwise it's parsed from the mission description (for example "…a batch of 24 Starlink satellites"). The vehicle page says how many flights have a published count.

## Run locally

```bash
npm run data      # pull real data into ./data (Node 20+)
npm run serve     # http://localhost:8080
```
If `./data` is empty, the page downloads directly from the API in your browser and caches it.

Offline development with synthetic data:
```bash
npm run mock          # terminal 1: fake LL2 API on :8765
npm run data:mock     # terminal 2: build ./data from it (delete ./data before going live)
```

## Files
| Path | What it does |
|---|---|
| `index.html`, `css/app.css` | Page shell and styles (light and dark themes) |
| `js/app.js` | Routing and views: fleet, archive, vehicle page, on orbit |
| `js/icons.js` | Generated SVG icons for each vehicle class |
| `js/store.js` | Data loading, year shards, live top-up |
| `js/ll2.js` | API client with rate-limit handling |
| `js/normalize.js` | Compact records and fleet derivation (shared by browser and Node) |
| `js/pipeline.js` | Incremental sync with checkpointing (shared) |
| `scripts/build-data.mjs` | Node entry point used by the Action |
| `.github/workflows/update.yml` | Schedule, commit and deploy |

Data © The Space Devs (Launch Library 2). Not affiliated with SpaceX.
