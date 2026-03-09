#!/usr/bin/env python3
"""
Full refresh: scrape → convert → embed → done.
Run: python3 refresh.py
"""
import re, subprocess, sys
from pathlib import Path

DIR = Path(__file__).parent

# 1. Scrape
print("=== Step 1/2: Scraping inspections ===")
result = subprocess.run([sys.executable, DIR / "scrape_inspections.py"])
if result.returncode != 0:
    sys.exit(result.returncode)

# 2. Convert & embed
print("\n=== Step 2/2: Embedding data into index.html ===")
result = subprocess.run([sys.executable, DIR / "csv_to_json.py"], capture_output=True, text=True)
if result.returncode != 0:
    print(result.stderr)
    sys.exit(result.returncode)
print(result.stderr.strip())

data_line = result.stdout.strip()
html_path = DIR / "index.html"
html = html_path.read_text(encoding="utf-8")
html = re.sub(r'const DATA = \[.*?\];', data_line, html, flags=re.S)
html_path.write_text(html, encoding="utf-8")

print("\nDone. Push to deploy:")
print("  git add WFI/index.html WFI/wake_inspections_*.csv && git commit -m 'Refresh inspection data' && git push")
