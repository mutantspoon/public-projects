#!/usr/bin/env python3
"""
Convert wake_inspections_*.csv → inline JSON for index.html

Usage:
    python3 csv_to_json.py                     # uses most recent CSV in same dir
    python3 csv_to_json.py wake_inspections_X.csv

Output: prints the JS const DATA = [...]; line to stdout.
Paste it into index.html replacing the existing DATA line.

Deduplicates by (premises_name, address) keeping the most recent inspection.
"""

import csv, json, sys, re
from pathlib import Path
from datetime import datetime

# ── Find CSV ──────────────────────────────────────────────────────────────────
def find_csv():
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    csvs = sorted(Path(__file__).parent.glob("wake_inspections_*.csv"), reverse=True)
    if not csvs:
        print("ERROR: no wake_inspections_*.csv found", file=sys.stderr)
        sys.exit(1)
    return csvs[0]

csv_path = find_csv()
print(f"Reading {csv_path.name}...", file=sys.stderr)

# ── Load & deduplicate ────────────────────────────────────────────────────────
def parse_date(s):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    return datetime.min

rows = {}  # key: (name, address) → best row
with open(csv_path, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        name = r["premises_name"].strip()
        addr = r["address"].strip()
        key  = (name.upper(), addr.upper())
        date = parse_date(r["inspection_date"])
        if key not in rows or date > parse_date(rows[key]["inspection_date"]):
            rows[key] = r

print(f"Unique establishments: {len(rows)}", file=sys.stderr)

# ── Build compact JSON records ────────────────────────────────────────────────
def to_float(s):
    try:
        return float(s.strip())
    except (ValueError, AttributeError):
        return 0.0

records = []
for r in rows.values():
    city = r.get("city", "").strip().title()
    records.append({
        "n": r["premises_name"].strip().upper(),
        "s": to_float(r["final_score"]),
        "g": r["grade"].strip(),
        "a": r["address"].strip().title(),
        "c": city,
        "z": r.get("zip", "").strip(),
    })

# Sort descending by score
records.sort(key=lambda x: x["s"], reverse=True)

# ── Output ────────────────────────────────────────────────────────────────────
json_str = json.dumps(records, separators=(",", ":"))
print(f"const DATA = {json_str};")
print(f"Done — {len(records)} records written.", file=sys.stderr)
