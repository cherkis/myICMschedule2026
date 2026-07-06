# myICM 2026

A personal schedule app for the **International Congress of Mathematicians 2026**
(Philadelphia, July 22–30, 2026). Browse the full ICM program, pick the talks you
want to attend, see them on your own calendar, highlight the ones you must not
miss, and add your own events (lunches, meetings) alongside them.

**Live app:** https://cherkis.github.io/myICMschedule2026

## Features

- **Full ICM program** — 700+ events with titles, abstracts, rooms, speakers, and
  affiliations, filterable by date and by category (Plenary Lectures, Section
  Lectures, Short Communications, …).
- **Your calendar** — tap **＋** on any event to add it; the calendar shows a dot
  on each day that has your events; today is highlighted.
- **Day view** — your events for a day, in time order, each showing time, room,
  speaker, and title. Tap one to re-read the abstract.
- **Highlights** — star the events you care most about; they stand out in the
  day view.
- **Your own events** — add anything to a day with just a time and a title.
- All times are **Philadelphia time**.
- Works in any modern desktop browser and on iPhone.

## 🔒 Privacy: all data stays on your device

Your selections, highlights, and personal events are stored **locally in your
browser** (localStorage). Nothing is ever uploaded or shared — the app has no
server, no accounts, no analytics, and no tracking of any kind. Once loaded, the
talks you selected remain available even without a network connection.

## ⚠️ Schedule accuracy

The app ships with a **snapshot** of the ICM program (the date is shown at the
bottom of the Schedule tab and in Help). Talks can be moved or cancelled at any
time — **always verify important events against the current official schedule at
[icm2026.org](https://www.icm2026.org)**.

## Install on iPhone

1. Open the app URL in **Safari**.
2. Tap the **Share** button (the square with an arrow).
3. Choose **Add to Home Screen**, then tap **Add**.

The app gets its own icon and opens full-screen like a native app. Your data
stays on the phone.

## Running / developing locally

No build step and no dependencies — plain HTML, CSS, and JavaScript:

```sh
cd myICMschedule2026
python3 -m http.server 8026
# open http://localhost:8026
```

## Refreshing the schedule data

`data/sessions.json` is generated from the ICM 2026 event platform by:

```sh
python3 tools/update-schedule.py
```

(Python 3.9+, standard library only.) The script fetches the current program,
filters out cancelled/unpublished entries, and prints a validation summary.
Commit and redeploy to publish the refreshed schedule — the app picks it up
automatically on next load.

## Project layout

```
index.html               app markup (all views)
styles.css               styling
app.js                   all logic; user data in localStorage
data/sessions.json       generated schedule snapshot
tools/update-schedule.py snapshot generator
apple-touch-icon.png     home-screen icon
```
