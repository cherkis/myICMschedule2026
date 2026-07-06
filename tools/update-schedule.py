#!/usr/bin/env python3
"""Regenerate data/sessions.json from the live ICM 2026 Cvent data.

Usage:  python3 tools/update-schedule.py
Fetches the public event snapshot + category names, filters active sessions,
and writes a minified data/sessions.json. Prints a validation summary.
No dependencies beyond the Python 3.9+ standard library.
"""
import json
import html
import re
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

EVENT_ID = "ac193975-5d24-4628-8c30-ddb23de19a8b"
ENVIRONMENT = "P2"
BASE = "https://www.icm2026.org"
SNAPSHOT_URL = f"{BASE}/event/api/legacyData/eventSnapshot?environment={ENVIRONMENT}"
GRAPHQL_URL = f"{BASE}/event/graphql"
STATUS_ACTIVE = 2  # status 7 = cancelled ("XXX CANCELLED ..." titles)
# Organizers also soft-mark sessions in the title: "XXX CANCELLED"/"XXX REMOVED"
# (dead), "XX"/"xx" (drafts), "Test", and "HIDDEN" (embargoed prize lectures —
# duplicated by public placeholder sessions like "Fields Medal Laudatio").
# The public site does not show these; neither do we.
MARKED_TITLE = re.compile(r"\s*(hidden\b|xx|test\s*$)", re.I)
PHILLY = ZoneInfo("America/New_York")

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "sessions.json"

CATEGORY_QUERY = """query getSessionAndSpeakerCategories($eventId: ID!, $environment: String!, $eventSnapshotVersion: String!, $cultureCode: String!) {
  event(input: { eventId: $eventId, eventSnapshotVersion: $eventSnapshotVersion, environment: $environment }) {
    sessionCategories(cultureCode: $cultureCode) { id name }
  }
}"""

# Strip only well-formed known HTML tags: "<div class=..>", "<p>", "<br/>".
# Must NOT touch raw math like "$a<b$ and $c>d$" (21 abstracts contain '<' in
# math), hence the requirement of a known tag name followed by '>', '/' or
# whitespace-led attributes.
_KNOWN = r"(?:a|b|i|u|s|em|strong|p|div|span|br|hr|ul|ol|li|sub|sup|h[1-6]|blockquote|pre|code|table|thead|tbody|tr|td|th|img|font)"
_BLOCK_RE = re.compile(rf"</(?:p|div|li|h[1-6]|tr|blockquote)\s*>|<br(?:\s[^>]*)?/?>", re.I)
_TAG_RE = re.compile(rf"</?{_KNOWN}(?:\s[^>]*)?/?>", re.I)


def clean_text(raw):
    """Cvent RTE HTML (or plain text) -> readable plain text, TeX preserved."""
    if not raw:
        return ""
    text = _BLOCK_RE.sub("\n", raw)
    text = _TAG_RE.sub("", text)
    text = html.unescape(text).replace("\xa0", " ").replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def post_json(url, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main():
    print(f"Fetching event snapshot from {SNAPSHOT_URL} ...")
    snap = post_json(SNAPSHOT_URL, {"eventId": EVENT_ID})
    snapshot_version = snap["snapshotVersion"]
    raw_sessions = snap["products"]["sessionContainer"]["optionalSessions"]
    speakers = snap["speakerInfoSnapshot"]["speakers"]
    print(f"  snapshotVersion {snapshot_version}; "
          f"{len(raw_sessions)} sessions, {len(speakers)} speakers in snapshot")

    print("Fetching session category names via GraphQL ...")
    gql = post_json(GRAPHQL_URL, {
        "operationName": "getSessionAndSpeakerCategories",
        "query": CATEGORY_QUERY,
        "variables": {
            "eventId": EVENT_ID,
            "environment": ENVIRONMENT,
            "eventSnapshotVersion": snapshot_version,
            "cultureCode": "en-US",
        },
    })
    cat_names = {c["id"]: c["name"] for c in gql["data"]["event"]["sessionCategories"] if c["name"]}
    print(f"  {len(cat_names)} named categories")

    sessions = []
    cancelled = marked = 0
    for s in raw_sessions.values():
        if s.get("status") != STATUS_ACTIVE:
            cancelled += 1
            continue
        if MARKED_TITLE.match(s.get("name") or ""):
            marked += 1
            continue
        speaker_refs = sorted(
            (s.get("speakerIds") or {}).values(),
            key=lambda r: r.get("sessionSpeakerOrder", 0),
        )
        sess_speakers = []
        for ref in speaker_refs:
            sp = speakers.get(ref.get("speakerId"))
            if not sp:
                continue
            name = f"{sp.get('firstName', '').strip()} {sp.get('lastName', '').strip()}".strip()
            if name:
                sess_speakers.append({"name": name, "aff": (sp.get("company") or "").strip()})
        sessions.append({
            "id": s["id"],
            "title": clean_text(s.get("name") or ""),
            "abstract": clean_text(s.get("description") or ""),
            "start": s["startTime"],
            "end": s["endTime"],
            "room": (s.get("locationName") or "").strip(),
            "cat": s.get("categoryId") or "",
            "speakers": sess_speakers,
        })
    sessions.sort(key=lambda x: (x["start"], x["title"]))

    used_cats = {s["cat"] for s in sessions}
    categories = {cid: cat_names.get(cid, "Other") for cid in used_cats}

    out = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "event": "ICM 2026, Philadelphia",
        "categories": categories,
        "sessions": sessions,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

    # ---- validation summary ----
    per_day = Counter()
    missing_room = missing_abs = no_speakers = 0
    for s in sessions:
        day = datetime.fromisoformat(s["start"].replace("Z", "+00:00")) \
            .astimezone(PHILLY).strftime("%Y-%m-%d")
        per_day[day] += 1
        missing_room += not s["room"]
        missing_abs += not s["abstract"]
        no_speakers += not s["speakers"]
    print(f"\nWrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")
    print(f"Published sessions: {len(sessions)} "
          f"(excluded {cancelled} cancelled, {marked} marked HIDDEN/XX/Test)")
    print("Per-day (Philadelphia time):")
    for day in sorted(per_day):
        print(f"  {day}: {per_day[day]}")
    print(f"Missing room: {missing_room} | missing abstract: {missing_abs} | no speakers: {no_speakers}")
    cat_counts = Counter(categories.get(s["cat"], "Other") for s in sessions)
    print("Top categories:")
    for name, n in cat_counts.most_common(8):
        print(f"  {n:4}  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
