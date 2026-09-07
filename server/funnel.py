#!/usr/bin/env python3
"""
Read the app's funnel events from Firestore and print a per-day table.
Usage: python3 server/funnel.py [days=7]
Auth: your gcloud login (gcloud auth print-access-token); no service account needed.
"""
import collections
import json
import subprocess
import sys
import time
import urllib.request

PROJECT = "katuvit-6bb08"
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 7
ORDER = ["app_open", "create_started", "create_picked", "upload_done", "transcribe_done", "create_failed",
         "export_started", "export_done", "export_failed", "photos_saved", "share_tapped", "session_reopened",
         "paywall_shown", "app_error"]


def token() -> str:
    return subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()


def run_query(body: dict) -> list[dict]:
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents:runQuery"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return [row["document"] for row in json.load(r) if "document" in row]


def val(v: dict):
    for k in ("stringValue", "integerValue", "doubleValue", "booleanValue"):
        if k in v:
            return v[k]
    if "mapValue" in v:
        return {kk: val(vv) for kk, vv in (v["mapValue"].get("fields") or {}).items()}
    return None


since = time.time() - DAYS * 86400
docs = run_query({"structuredQuery": {
    "from": [{"collectionId": "events"}],
    "where": {"fieldFilter": {"field": {"fieldPath": "ts"}, "op": "GREATER_THAN_OR_EQUAL", "value": {"doubleValue": since}}},
    "orderBy": [{"field": {"fieldPath": "ts"}, "direction": "ASCENDING"}],
    "limit": 5000,
}})
events = [{k: val(v) for k, v in d["fields"].items()} for d in docs]
print(f"{len(events)} events in the last {DAYS} days")

by_day = collections.defaultdict(collections.Counter)
users_by_day = collections.defaultdict(set)
errors, fails = [], []
for e in events:
    by_day[e["day"]][e["name"]] += 1
    users_by_day[e["day"]].add(e["uid"])
    if e["name"] == "app_error":
        errors.append(e)
    if e["name"] in ("create_failed", "export_failed"):
        fails.append(e)

names = [n for n in ORDER if any(n in c for c in by_day.values())]
print("\nday         users " + " ".join(f"{n[:12]:>12}" for n in names))
for day in sorted(by_day):
    c = by_day[day]
    print(f"{day}  {len(users_by_day[day]):>5} " + " ".join(f"{c.get(n, 0):>12}" for n in names))

if fails:
    print("\nfailures (latest 10):")
    for e in fails[-10:]:
        p = e.get("props") or {}
        print(f"  {e['day']} {e['name']:<14} {p.get('stage', '')} {str(p.get('message', ''))[:100]}")
if errors:
    print("\napp errors (latest 10):")
    for e in errors[-10:]:
        p = e.get("props") or {}
        print(f"  {e['day']} {'FATAL' if p.get('fatal') else 'js   '} {str(p.get('message', ''))[:100]}")
