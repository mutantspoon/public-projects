#!/usr/bin/env python3
"""
Wake County NC Restaurant Sanitation Inspection Scraper — Parallel Edition
Source:  https://public.cdpehs.com/NCENVPBL/ESTABLISHMENT/ShowESTABLISHMENTTablePage.aspx?ESTTST_CTY=92
Filters: Restaurants only (type 1), last 12 months

Splits the page range into batches, runs CONCURRENCY batches in parallel,
saves each batch to batches/batch_NNN-MMM.csv so you can resume after errors.
Final combined CSV: wake_inspections_YYYY-MM-DD.csv

Setup (one-time):
    pip install playwright
    python -m playwright install chromium
Run:
    python3 scrape_inspections.py
Resume after partial failure:
    python3 scrape_inspections.py   # already-saved batches are skipped automatically
"""

import csv
import re
import sys
import asyncio
from datetime import datetime, timedelta
from pathlib import Path

try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed.")
    print("Run:  pip install playwright && python -m playwright install chromium")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL    = "https://public.cdpehs.com/NCENVPBL/ESTABLISHMENT/ShowESTABLISHMENTTablePage.aspx?ESTTST_CTY=92"
EST_TYPE    = "1"           # 1 = Restaurant
DATE_FROM   = (datetime.today() - timedelta(days=365)).strftime("%m/%d/%Y")
DATE_TO     = datetime.today().strftime("%m/%d/%Y")
PAGE_DELAY  = 0.3           # seconds between page requests within a worker
TIMEOUT_MS  = 30_000
BATCH_SIZE  = 20            # pages per batch file
CONCURRENCY = 4             # parallel browser instances (be polite)

OUTPUT_DIR  = Path(__file__).parent
BATCH_DIR   = OUTPUT_DIR / "batches"

CSV_COLUMNS = [
    "inspection_date", "premises_name", "address", "city", "state", "zip",
    "state_id", "establishment_type", "final_score", "grade", "inspector_id",
]

# ASP.NET postback targets (confirmed from live DOM)
PB_SEARCH = "ctl00$PageContent$FilterButton$_Button"
PB_PAGE   = "ctl00$PageContent$Pagination$_PageSizeButton"

# Selectors
SEL_EST_TYPE  = "#ctl00_PageContent_EST_TYPE_IDFilter"
SEL_DATE_FROM = "#ctl00_PageContent_INSPECTION_DATEFromFilter"
SEL_DATE_TO   = "#ctl00_PageContent_INSPECTION_DATEToFilter"
SEL_CURR_PAGE = "#ctl00_PageContent_Pagination__CurrentPage"
SEL_DATA_ROW  = "tr:has(td[id$='_ViolDtlRow'])"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def batch_path(start, end):
    return BATCH_DIR / f"batch_{start:04d}-{end:04d}.csv"


def parse_pagination(body_text):
    total_pages = total_items = None
    # Page count: "of 477" (followed by tabs/whitespace)
    m = re.search(r"of\s+([\d,]+)\s", body_text)
    if m:
        total_pages = int(m.group(1).replace(",", ""))
    # Item count: "4770 Items" (non-breaking space before Items)
    m2 = re.search(r"([\d,]+)\s*\u00a0Items", body_text)
    if m2:
        total_items = int(m2.group(1).replace(",", ""))
    # Fallback: derive pages from items (10 per page)
    if total_items and not total_pages:
        total_pages = (total_items + 9) // 10
    return total_pages, total_items


def split_city_state_zip(raw):
    cleaned = raw.replace("\xa0", " ").strip()
    m = re.match(r"^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$", cleaned)
    if m:
        return m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    return cleaned, "", ""


async def postback(page, target):
    async with page.expect_navigation(wait_until="load", timeout=TIMEOUT_MS):
        await page.evaluate(f"__doPostBack('{target}','')")


async def extract_rows(page):
    records = []
    rows = page.locator(SEL_DATA_ROW)
    count = await rows.count()
    for i in range(count):
        row = rows.nth(i)
        cells = row.locator("td.ttc")
        nc = await cells.count()
        if not (9 <= nc <= 12):
            continue

        async def c(j):
            try:
                return (await cells.nth(j).inner_text()).strip().replace("\xa0", " ")
            except Exception:
                return ""

        raw_addr = await c(3)
        parts = raw_addr.split("\n", 1)
        address = parts[0].strip()
        city, state, zip_ = split_city_state_zip(parts[1] if len(parts) > 1 else "")

        records.append({
            "inspection_date":    await c(1),
            "premises_name":      (await c(2)).strip(),
            "address":            address,
            "city":               city,
            "state":              state,
            "zip":                zip_,
            "state_id":           await c(4),
            "establishment_type": await c(5),
            "final_score":        await c(6),
            "grade":              await c(7),
            "inspector_id":       await c(8),
        })
    return records


# ---------------------------------------------------------------------------
# Step 1 — Probe: get total page count
# ---------------------------------------------------------------------------

async def probe_total_pages(pw):
    print("Probing total pages...", end=" ", flush=True)
    browser = await pw.chromium.launch(headless=True)
    context = await browser.new_context(user_agent=UA)
    page = await context.new_page()
    page.set_default_timeout(TIMEOUT_MS)
    try:
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.select_option(SEL_EST_TYPE, value=EST_TYPE)
        await page.fill(SEL_DATE_FROM, DATE_FROM)
        await page.fill(SEL_DATE_TO, DATE_TO)
        await postback(page, PB_SEARCH)
        body = await page.inner_text("body")
        total_pages, total_items = parse_pagination(body)
        print(f"{total_items:,} inspections across {total_pages} pages")
        return total_pages
    finally:
        await browser.close()


# ---------------------------------------------------------------------------
# Step 2 — Worker: scrape one batch of pages
# ---------------------------------------------------------------------------

async def scrape_batch(pw, sem, start_page, end_page):
    out = batch_path(start_page, end_page)

    # Skip if already done
    if out.exists() and out.stat().st_size > 0:
        with open(out, newline="", encoding="utf-8") as f:
            n = sum(1 for _ in csv.DictReader(f))
        print(f"  [batch {start_page}-{end_page}] SKIP (already saved, {n} rows)")
        return

    async with sem:
        records = []
        attempt = 0
        while attempt < 3:
            attempt += 1
            try:
                browser = await pw.chromium.launch(headless=True)
                context = await browser.new_context(user_agent=UA)
                page = await context.new_page()
                page.set_default_timeout(TIMEOUT_MS)

                # Load and filter
                await page.goto(BASE_URL, wait_until="networkidle")
                await page.select_option(SEL_EST_TYPE, value=EST_TYPE)
                await page.fill(SEL_DATE_FROM, DATE_FROM)
                await page.fill(SEL_DATE_TO, DATE_TO)
                await postback(page, PB_SEARCH)

                # Jump to start_page (if not page 1)
                if start_page > 1:
                    await page.fill(SEL_CURR_PAGE, str(start_page))
                    await postback(page, PB_PAGE)

                # Iterate through assigned pages
                seen = set()
                for pg in range(start_page, end_page + 1):
                    rows = await extract_rows(page)
                    for r in rows:
                        key = (r["inspection_date"], r["state_id"], r["final_score"])
                        if key not in seen:
                            seen.add(key)
                            records.append(r)

                    if pg < end_page:
                        await asyncio.sleep(PAGE_DELAY)
                        await page.fill(SEL_CURR_PAGE, str(pg + 1))
                        await postback(page, PB_PAGE)

                await browser.close()
                break  # success

            except Exception as e:
                print(f"  [batch {start_page}-{end_page}] attempt {attempt} failed: {e}")
                try:
                    await browser.close()
                except Exception:
                    pass
                if attempt >= 3:
                    print(f"  [batch {start_page}-{end_page}] GIVING UP after 3 attempts")
                    return
                await asyncio.sleep(2 * attempt)

        # Save batch
        with open(out, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(records)

        print(f"  [batch {start_page:4d}-{end_page:4d}] {len(records):3d} rows → {out.name}")


# ---------------------------------------------------------------------------
# Step 3 — Combine all batch CSVs into final output
# ---------------------------------------------------------------------------

def combine_batches(total_pages):
    today = datetime.today().strftime("%Y-%m-%d")
    out_path = OUTPUT_DIR / f"wake_inspections_{today}.csv"

    seen = set()
    all_records = []

    # Read in page order
    batch_files = sorted(BATCH_DIR.glob("batch_*.csv"))
    for bf in batch_files:
        with open(bf, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                key = (r["inspection_date"], r["state_id"], r["final_score"])
                if key not in seen:
                    seen.add(key)
                    all_records.append(r)

    print(f"\nCombining {len(batch_files)} batch files → {len(all_records):,} unique records")

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(all_records)

    print(f"Saved: {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def scrape():
    BATCH_DIR.mkdir(exist_ok=True)

    print("Wake County NC Restaurant Inspection Scraper (Parallel)")
    print(f"Filter      : Restaurants | {DATE_FROM} → {DATE_TO}")
    print(f"Concurrency : {CONCURRENCY} workers, {BATCH_SIZE} pages/batch")
    print("-" * 60)

    async with async_playwright() as pw:
        # Probe total pages
        total_pages = await probe_total_pages(pw)
        if not total_pages:
            print("ERROR: could not determine total pages")
            sys.exit(1)

        # Build batch ranges
        batches = []
        for start in range(1, total_pages + 1, BATCH_SIZE):
            end = min(start + BATCH_SIZE - 1, total_pages)
            batches.append((start, end))

        print(f"Batches     : {len(batches)} total ({BATCH_SIZE} pages each)")
        print(f"Batch dir   : {BATCH_DIR}\n")

        # Count already-done
        done = sum(1 for s, e in batches if batch_path(s, e).exists() and batch_path(s, e).stat().st_size > 0)
        if done:
            print(f"Resuming    : {done}/{len(batches)} batches already saved, skipping\n")

        # Run batches with concurrency limit
        sem = asyncio.Semaphore(CONCURRENCY)
        tasks = [scrape_batch(pw, sem, s, e) for s, e in batches]
        await asyncio.gather(*tasks)

    # Combine
    combine_batches(total_pages)
    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(scrape())
