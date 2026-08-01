---
name: auto-commit-on-data-update
description: When updating data in public-projects, always commit and push without asking
metadata:
  type: feedback
---

When the user asks to "update data" (e.g. WFI inspection refresh), always commit and push the result automatically — do not stop to ask for confirmation.

**Why:** The whole point of a data update in these static GitHub Pages projects is to publish it; pushing is what triggers the auto-deploy. Asking first is unwanted friction.

**How to apply:** After a successful refresh, stage the changed files (e.g. `index.html` + `wake_inspections_*.csv`), commit with a descriptive message, and `git push`. If the push is rejected, `git pull --rebase` then push again.
