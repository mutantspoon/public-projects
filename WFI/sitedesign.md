# Food Inspection Lookup — Site Design

## Purpose

Personal tool for quickly looking up restaurant sanitation inspection scores.
Single-page, no login, no attribution to data source.

---

## Hosting

- Static HTML file, deployed to GitHub Pages
- No server, no backend, no build step required
- Data embedded as JSON at the top of the HTML file

---

## Data

- Source: CSV produced by `scrape_inspections.py` → converted to inline JSON in the HTML
- Fields used: `premises_name`, `final_score`, `grade`, `address`, `city`, `zip`, `report_url`
- **`report_url` must be added to the scraper** — it's already available at cell index 9 in the scraped table but not currently captured
- Data refresh: re-run scraper → re-embed JSON → re-deploy

---

## UI

### Layout

Single-page, minimal. No nav, no header chrome. Vertically centered on load.

```
┌──────────────────────────────────────┐
│                                      │
│   [ Search restaurants...          ] │
│                                      │
│   NAME                   SCORE  GRD  │
│   123 Main St, City               ↗  │
│   ─────────────────────────────────  │
│   NAME                   SCORE  GRD  │
│   456 Oak Ave, City               ↗  │
│   ...                                │
└──────────────────────────────────────┘
```

### Search Box

- Full-width input at the top
- Placeholder: `Search restaurants...`
- Filters results on every keystroke (no submit button)
- Case-insensitive, matches anywhere in the establishment name

### Results

- Shown immediately below the search box
- Sorted by `final_score` descending (highest first)
- On empty query: show no results (blank state, not all records)
- Each row shows:
  - **Premises name** (left, prominent)
  - **Final score** (right, bold)
  - **Grade** (right of score, e.g. `A`)
  - **Address** (below name, muted/smaller — `123 Main St, City, ZIP`)
  - **Report link** (icon/arrow, opens in new tab)
- Limit visible results to top 50 matches for performance

### Blank / No-match States

- No query entered: show nothing (empty page below search bar)
- Query with no matches: show `No results` message

---

## Tech Stack

- Pure HTML + CSS + JavaScript (no frameworks, no CDN dependencies)
- JSON data embedded as a `const DATA = [...]` at the top of the script
- Search: filter array in memory on `input` event — instant, no debounce needed
- DOM: render result rows by setting `innerHTML` on a container div

---

## Data Refresh Workflow

1. Run `scrape_inspections.py` → produces `wake_inspections_YYYY-MM-DD.csv`
2. Run conversion script (to be written) → extracts relevant fields, outputs JS/JSON snippet
3. Paste JSON into `index.html`
4. Push to GitHub → auto-deploys

---

## Out of Scope

- Filtering by grade, city, or score range
- Sorting controls
- Mobile-specific layout (legible on mobile is fine, not optimized)
- Pagination (top-50 cap handles this)
- Any mention of data source or county name
