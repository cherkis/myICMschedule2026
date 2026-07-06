# myICMschedule2026 — Project Plan

## Progress checklist

### Phase A — foundation
- [x] A1. Study original plan, explore `../planapp`, reverse-engineer ICM 2026 data source (endpoints verified live)
- [x] A2. Write `CLAUDE.md` (95%-certainty rule, project constraints, verified data facts)
- [x] A3. Write this refined `plan.md`
- [x] A4. **USER APPROVAL of this plan — gate: no app code before this** (approved 2026-07-05)

### Phase B — data pipeline
- [x] B1. `tools/update-schedule.py`: fetch eventSnapshot + category names, emit minified `data/sessions.json`
- [x] B2. Run updater; validate output (737 published sessions; per-day distribution ✓; plenary speakers externally verified vs. IMU/EPFL/Simons announcements)

### Phase P — minimal working prototype
- [x] P1. Prototype slice (real data, served locally): schedule list with date tabs + select/unselect button, calendar with dots, day view of selected events, bare-bones detail (abstract as plain text), localStorage persistence. No category filter, manual events, help page, or styling polish yet. (Verified in headless Chrome: 737 rows render, 9 day groups, Philadelphia times correct.)
- [x] P2. **USER TRY-OUT & FEEDBACK — gate passed 2026-07-05 ("Looks nice"), no changes requested**

### Phase C — app
- [x] C1. App shell: `index.html` (5 views + bottom nav), `styles.css` (planapp-style theme, responsive for desktop AND iPhone), `app.js` skeleton with `showView()`, localStorage helpers, and schedule loader (revalidating fetch of `data/sessions.json`)
- [x] C2. Schedule (catalog) view: date tabs (All dates / Jul 22–30), category filter, event rows, select/unselect button, "Schedule snapshot from {date} — always verify against icm2026.org" stamp
- [x] C3. Event detail view: full title, Philadelphia time, room, speakers + affiliations, abstract (+ highlight button when selected)
- [x] C4. Calendar view: month grid, today highlighted, dots on days with selected or manual events, Today button
- [x] C5. Day view: selected ICM events + manual events merged, sorted by time (time · room · speaker · truncated title), highlight toggle, tap → detail (offline-capable from localStorage)
- [x] C6. Manual events: "+ Add my own event" in day view (time picker + title field, planapp-style), edit/delete, highlightable, stored locally
- [x] C7. Help/instructions view (nav button): usage, iPhone install steps, privacy note, snapshot-accuracy disclaimer with icm2026.org link
- [x] C8. Polish for both targets: apple-touch meta tags + generated 180×180 icon; hover states, ≥16px inputs (no iOS zoom), keyboard/mouse-usable controls
- [x] C9. `README.md`: app description, iPhone install instructions, local-data privacy statement, snapshot disclaimer, refresh how-to

### Phase D — verify & deploy
- [x] D1. Verified end-to-end via automated harness in headless Chrome (26/26 checks): data load (737 sessions, 22 categories, 9 days), timezone (16:50Z→12:50 PM), date tabs, category filter (19 plenaries), select stores full copy incl. abstract, calendar dots + today, day view, highlight persist + styling, detail abstract, manual add/edit/delete/sort, calendar dot for manual, unselect, and localStorage persistence across browser restart. Fixed one real bug found: manual-event id collision within same millisecond. Visuals confirmed by screenshots (headless-Chrome note: viewport min-width 500 clips narrower screenshots — not an app issue).
- [x] D2a. `git init` + initial commits on `main`; remote set to https://github.com/cherkis/myICMschedule2026.git
- [x] D2b. USER created GitHub repo `myICMschedule2026`
- [x] D2c. `main` pushed; USER enabled Pages — live at https://cherkis.github.io/myICMschedule2026/
- [x] D3a. Live URL verified: all assets 200, sessions.json gzipped to 330 KB on the wire, headless-Chrome render of the live site shows all 737 sessions + snapshot disclaimer
- [x] D3b. USER installed on iPhone and confirmed all working (2026-07-05) — **PROJECT COMPLETE** 🎉

---

## Goal (from original plan)

A web app similar to `../planapp` that lets the user pick interesting events from the 2026 ICM schedule, place them on an in-app calendar, and highlight some of them there. Requirements from the original plan, all retained:

- Schedule read from the ICM 2026 catalog (icm2026.org, event `ac193975-5d24-4628-8c30-ddb23de19a8b`).
- User can select "All dates" or any specific date.
- Click an event → see its summary/abstract.
- Button next to each event selects it → added to the user's calendar.
- Calendar view with today highlighted; select a date → see selected events for that date.
- In day view, user can tag an event to highlight it.
- Day-view rows show time, location, speaker name, and (truncated) title.
- Clicking a day-view event shows the description/abstract.
- **All data stored locally on the device; no user data is shared.**
- `README.md` describing the app + iPhone install; in-app instruction page in the menu.

Decisions made with the user (2026-07-05):
- Offline: only *selected* talks guaranteed offline (full event data copied into localStorage on selection). No service worker/manifest — apple-touch meta tags only, like planapp.
- Browse aids: category filter **yes**, text search **no**.
- Times: always Philadelphia time (America/New_York).
- Hosting: git + GitHub Pages, like planapp.
- **Manual events**: user can add own events to a day (select time + enter title, planapp-style), edit/delete them, highlight them like ICM events. Stored locally.
- **Schedule freshness: no live refresh.** (Browser CORS blocks the Cvent endpoints — verified; public CORS proxies also verified failing on the 4.6 MB POST.) The app ships a schedule snapshot; the Help page, schedule view, and README must carry a clear note asking users to **always verify against the current schedule on icm2026.org** for any changes. Snapshot can be refreshed anytime by re-running `tools/update-schedule.py` and redeploying.
- **Targets**: must work well in a generic desktop browser (mouse, hover, keyboard, wider layout) and on iPhone (touch, Add to Home Screen).

## Architecture

Zero-dependency static site, same shape as planapp:

```
myICMschedule2026/
├── index.html            # all views as .view divs; apple-touch meta tags
├── styles.css            # CSS-variable iOS theme (adapted from planapp)
├── app.js                # all logic
├── apple-touch-icon.png  # 180×180
├── data/sessions.json    # generated schedule snapshot (static, bundled)
├── tools/update-schedule.py
├── README.md
├── CLAUDE.md
└── plan.md
```

### Data pipeline (B1–B2)

`tools/update-schedule.py` (python3 stdlib only):
1. POST eventSnapshot (endpoint + body in CLAUDE.md) → keep sessions with `status == 2` AND titles not marked `HIDDEN`/`XX…`/`Test` (organizers' soft-delete + embargo markers; the HIDDEN prize lectures have public placeholder duplicates); join `speakerIds` → speaker names/affiliations.
2. POST GraphQL `getSessionAndSpeakerCategories` (using `snapshotVersion` from step 1) → `{categoryId: name}`.
3. Emit minified `data/sessions.json`:
   ```json
   { "updated": "ISO timestamp", "categories": {"id": "name"},
     "sessions": [{"id","title","abstract","start","end","room","cat",
                    "speakers":[{"name","aff"}]}] }
   ```
   Times stay UTC (converted at render). Abstracts: strip HTML tags, keep TeX `$...$` as plain text.
4. Print validation summary: total sessions, per-day counts, sessions missing location/description.

Validation targets (measured 2026-07-05, after filtering 36 cancelled + 59 marked from the 832 raw): **737 published sessions**, 975 KB minified; per-day (EDT) 07-22: 3, 07-23: 11, 07-24: 138, 07-25: 138, 07-26: 138, 07-27: 126, 07-28: 121, 07-29: 58, 07-30: 4; 10 missing room, 44 missing abstract, 87 with no speakers (breaks/receptions — legitimate). External spot-check passed: plenary speakers (Buffa, Manolescu) match public IMU/EPFL/Simons announcements.

### Prototype (P1–P2)

A deliberately rough but working slice built on the real `data/sessions.json`: the same `index.html`/`app.js`/`styles.css` files that will grow into the full app (not throwaway code) with minimal versions of the schedule list (date tabs + select toggle), calendar (dots), day view, and a plain-text detail view. Purpose: validate the data pipeline end-to-end and let the user judge the feel of the core select→calendar→day flow. The user tries it locally (`python3 -m http.server`) and gives feedback; Phase C proceeds only after that feedback is incorporated into this plan.

### App (C1–C9)

**Views** (planapp `showView()` pattern): `schedule`, `detail`, `calendar`, `day`, `help`. Bottom nav: Schedule · Calendar · Help(?)

**Data loading**: on app start and on entering the schedule view, `fetch('data/sessions.json', {cache:'no-cache'})` (ETag revalidation → a redeployed snapshot appears without reinstalling); on network failure retry with `{cache:'force-cache'}` and show the stamp of whatever loaded. Schedule view footer + Help show: "Schedule snapshot from {updated} — always verify against the current schedule at icm2026.org".

- **Schedule**: horizontal date-tab strip ("All dates", "Wed 22" … "Thu 30"; grouping by EDT day) + category `<select>` (All categories + 32 names). Rows: start time, title (2-line clamp), speaker name(s), category tag; right-side `[+]`/`[✓]` select toggle. Tap row → detail. "All dates" renders day section headers; with 832 rows, render per-day lazily (only expand day sections on demand) to keep DOM light.
- **Detail**: full title, weekday + date, start–end (Philadelphia), room, speakers with affiliations, abstract text, select/unselect + highlight buttons. Reached from schedule (reads sessions.json) or day view (reads localStorage copy — offline-capable).
- **Calendar**: month grid (adapted `renderCalendar`), opens on today if within Jul 2026, else July 2026. `.today` highlight, dot on days with selected events, tap → day view.
- **Day**: selected ICM events **and manual events** for that date, merged and sorted by start time; row = `HH:MM · room · speaker · truncated title` (manual rows: `HH:MM · title` with a small "mine" marker); star toggle (`highlighted` flag) gives accent-color styling; tap → detail (ICM) or edit form (manual). **"+ Add event"** button (planapp add-task pattern): `<input type="time">` + title text field → saves a manual event to that day; editable and deletable afterwards.
- **Help**: how each view works, install-on-iPhone steps, privacy statement, snapshot stamp + **disclaimer to always verify against the current ICM schedule on icm2026.org**.

**Storage** (planapp get/save helper pattern):
- `myicm_selected`: `{ [sessionId]: {…full session object…, highlighted: bool, selectedAt: ISO} }`
- `myicm_manual`: `{ [id]: {id, date: 'YYYY-MM-DD', time: 'HH:MM', title, highlighted: bool, createdAt: ISO} }` (id = `man_<epoch>`; date/time are Philadelphia-local as entered)
- Day keying by EDT date string derived via `Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York'})` → `YYYY-MM-DD` (zero-padded, sortable — deliberate improvement over planapp's unpadded keys).

**Desktop + iPhone**: one responsive layout — centered column (max-width ~640–800px), touch-size tap targets, plus `:hover`/`:focus-visible` states and standard scrolling for desktop; no long-press-only interactions (everything reachable by click). Verified in desktop Chrome/Safari and iPhone Safari.

**Reused planapp patterns**: view switching, localStorage JSON helpers, CSS variables/iOS look, calendar grid CSS, click-outside menu closing, apple-touch meta tags. Not reused: drag-reorder, recurring tasks, task statuses.

### Verification (D1) — definition of done

1. Updater re-run is idempotent; JSON validates against targets above.
2. Local serve: select 3 events on different days (incl. one Short Communication with TeX in abstract) → appear in calendar dots, day views, correct Philadelphia times (e.g. a session stored `2026-07-28T16:50:00Z` must show 12:50 PM Jul 28).
3. Highlight toggle persists across reload; unselect removes from calendar.
4. With DevTools offline + sessions.json blocked: calendar/day/detail of selected events still fully functional from localStorage.
5. Category filter + each date tab return plausible counts (match per-day numbers).
6. Manual events: add (time + title) → appears in day view sorted correctly and as a calendar dot; edit, delete, highlight all persist across reload.
7. iPhone-width responsive check (390px): no horizontal scroll, titles truncate. Desktop check (Chrome + Safari, ≥1200px window): comfortable layout, hover states, all flows mouse-only.
8. Disclaimer + snapshot stamp visible in schedule view, Help, and README.

### Deploy (D2–D3)

`git init`, commit all; `gh repo create cherkis/myICMschedule2026 --public --source . --push`; enable Pages from `main` branch root; verify `https://cherkis.github.io/myICMschedule2026` loads and behaves; user installs on iPhone (Share → Add to Home Screen) and confirms.
