# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A personal tool for looking up Wake County NC restaurant sanitation inspection scores. Two parts:
1. **Scraper** — pulls data from the NC public health inspection site into a CSV
2. **Site** — a single static `index.html` with the data embedded as inline JSON, deployed to GitHub Pages

## Data Refresh Workflow

```bash
# Full refresh in one shot:
python3 refresh.py

# Or step by step:
python3 scrape_inspections.py   # → wake_inspections_YYYY-MM-DD.csv + batches/
python3 csv_to_json.py          # → prints `const DATA = [...];` to stdout
# Then paste that line into index.html replacing the existing DATA line
```

After refreshing, commit and push — GitHub Pages auto-deploys.

## Scraper Architecture

`scrape_inspections.py` uses **Playwright** (headless Chromium) to drive the ASP.NET WebForms site at `public.cdpehs.com`. Key gotchas:

- **Filters don't work via normal `.click()`** — must call `__doPostBack()` directly via `page.evaluate()`. The search button is an `<a>` tag that triggers a full page navigation.
- **Navigation uses `expect_navigation()`** — wrapping `page.evaluate("__doPostBack(...)")` in `async with page.expect_navigation(wait_until="load")` is required; `wait_for_load_state()` alone misses the navigation.
- **Row deduplication** — each page has 5 phantom rows (with ~100 cells) that match the same selector as real data rows (which have 10 cells). Filter with `9 <= nc <= 12`.
- **Parallelism** — splits 477 pages into 24 batches of 20 pages, runs 4 concurrent browser instances. Each batch saves to `batches/batch_NNNN-MMMM.csv`. Already-saved batches are skipped on rerun (resume support).
- **Page navigation** — fill `#ctl00_PageContent_Pagination__CurrentPage` with the target page number, then `__doPostBack('ctl00$PageContent$Pagination$_PageSizeButton','')`.
- **Filter postback target** — `ctl00$PageContent$FilterButton$_Button`

## Site Architecture

`index.html` is a self-contained, zero-dependency HTML file:
- `const DATA = [...]` at the top of the `<script>` block holds all records as compact JSON objects (`n`, `s`, `g`, `a`, `c`, `z` for name/score/grade/address/city/zip)
- Search filters `DATA` in memory on every `input` event, shows top 50 matches sorted by score descending
- Empty query → blank; no matches → "No results"
- No frameworks, no CDN, no build step

## Out of Scope

Per design spec: no filtering by grade/city/score, no sort controls, no pagination UI, no mention of data source or county name, no report/violation links (the site's report links use session-bound `__doPostBack` with no stable URL).
