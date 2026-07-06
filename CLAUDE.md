# CLAUDE.md — myICMschedule2026

## Working rules (non-negotiable)

1. **95% certainty rule.** Never start a task — coding, refactoring, data work, deployment — without at least 95% certainty about what is wanted and how it will be verified. If certainty is lower, ask the user questions (one focused round at a time) until it is reached. Prefer verifying facts yourself (read the code, query the live endpoint, test in a browser) over both assuming and over asking questions the code can answer.
2. **Plan-driven, step by step.** `plan.md` is the single source of truth. Work strictly in checklist order, one step at a time. After completing a step, check it off (`[x]`) in `plan.md` in the same commit/change set. Never silently skip or reorder steps; propose plan changes to the user first.
3. **Approval gates.** Do not begin building the app (Phase B onward in `plan.md`) until the user has explicitly approved `plan.md`. After the Phase P minimal prototype, pause for the user's hands-on try-out and incorporate their feedback before starting full Phase C buildout. Any later scope change also requires explicit approval.
4. **Verify before declaring done.** Every step's "done" means demonstrated working (script ran, page rendered, flow clicked through), not "code written". Report failures honestly with output.

## Project constraints

- **Stack:** vanilla HTML/CSS/JS only — no frameworks, no build step, no npm dependencies. Modeled on `../planapp` (same view-switching SPA pattern, localStorage helpers, iOS-style CSS variables).
- **Privacy promise (load-bearing, advertised in README):** all user data lives in `localStorage` on the device. The app must never send user data anywhere — no analytics, no external requests carrying user state. The only network activity permitted at runtime is loading the app's own static files.
- **Offline scope:** selected talks must remain usable offline → selecting an event copies its FULL data (title, abstract, times, room, speakers) into localStorage. No service worker, no manifest.json — apple-touch meta tags only.
- **Manual events:** user can add own events to a day (time + title), stored in `localStorage` key `myicm_manual`, highlightable like ICM events.
- **Schedule freshness:** NO live refresh (user decision 2026-07-05). The app ships a static snapshot (`data/sessions.json`); schedule view, Help page, and README must all carry a note to **always verify against the current schedule on icm2026.org**. Snapshot refresh = re-run `tools/update-schedule.py` + redeploy. Do not add relays/proxies/scheduled jobs.
- **Times:** always display Philadelphia time (`Intl.DateTimeFormat` with `timeZone: 'America/New_York'`). Source data is UTC.
- **Targets:** must work well in generic desktop browsers (mouse, hover, keyboard-usable) AND iPhone Safari (touch, Add to Home Screen). No long-press-only interactions.
- **Deployment:** git repo published via GitHub Pages at `https://cherkis.github.io/myICMschedule2026`.

## Data source facts (verified 2026-07-05 — reuse, don't re-derive)

- Congress: ICM 2026, Pennsylvania Convention Center, Philadelphia, July 22–30, 2026 (main program Jul 23–30). Event id: `ac193975-5d24-4628-8c30-ddb23de19a8b`, environment `P2`.
- Sessions + speakers: `POST https://www.icm2026.org/event/api/legacyData/eventSnapshot?environment=P2`, JSON body `{"eventId":"ac193975-5d24-4628-8c30-ddb23de19a8b"}` → ~4.65 MB JSON. Sessions in `products.sessionContainer.optionalSessions` (832 entries; fields: `name`, `description` = abstract, `startTime`/`endTime` UTC, `locationName`, `categoryId`, `speakerIds`, `status` — keep only `status == 2`). Speakers in `speakerInfoSnapshot.speakers` (897; `firstName`, `lastName`, `company`, `biography`). Top-level `snapshotVersion` feeds the category query.
- Category names (32): GraphQL `POST https://www.icm2026.org/event/graphql`, query `getSessionAndSpeakerCategories(eventId, environment, eventSnapshotVersion, cultureCode:"en-US")` → `event.sessionCategories {id name}`.
- **CORS blocks these endpoints from browsers** (preflight 500, no ACAO on response) → schedule data is fetched by `tools/update-schedule.py` on the Mac and bundled as static `data/sessions.json`. Refreshing the schedule = re-run script + redeploy.
- Live in-browser refresh was investigated and ruled out (2026-07-05): the guestside GraphQL `Event` type exposes no session-list field (all query texts in the app's JS chunks swept), and four public CORS proxies (corsproxy.io, allorigins, codetabs, cors.workers.dev) all failed to relay the 4.6 MB POST. Don't revisit without new evidence.
- Abstracts may contain HTML fragments and TeX `$...$` — strip/neutralize HTML, preserve TeX as text.

## Refreshing the schedule snapshot

When the user asks to refresh/update the schedule (most useful in the weeks around the congress, July 2026):

```sh
cd /Users/cherkis/MyApps/myICMschedule2026
python3 tools/update-schedule.py        # regenerates data/sessions.json, prints validation summary
```

1. Sanity-check the printed summary against the previous run (baseline 2026-07-05: 737 published sessions, peak ~138/day Jul 24–26). Small drifts are normal (talks added/cancelled); investigate anything drastic (e.g. count halves → endpoint or filter broke; do NOT push).
2. Spot-check one or two changed/new titles against the live catalog page if the diff is large (`git diff --stat data/sessions.json` first; `python3 -c ...` to compare titles).
3. Publish:
   ```sh
   git add data/sessions.json && git commit -m "Refresh schedule snapshot" && git push
   ```
   GitHub Pages redeploys automatically (~1 min). Verify:
   ```sh
   curl -s https://cherkis.github.io/myICMschedule2026/data/sessions.json | \
     python3 -c "import json,sys; d=json.load(sys.stdin); print(d['updated'], len(d['sessions']), 'sessions')"
   ```
4. The app picks the new file up on next load (revalidating fetch) — users don't reinstall. The "Schedule snapshot from {date}" stamp in the app and Help page updates automatically from the `updated` field.

If the script errors: the Cvent endpoints or snapshot format may have changed — re-derive from the facts above (start by checking the eventSnapshot POST with curl) before touching the app.
