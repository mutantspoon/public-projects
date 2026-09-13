# FOT

FOT Trading Cards showcase site, built with Jordan's son. One static `index.html`: a carousel card browser, three pack-pricing blocks, an embedded Google Form for orders (no backend), and a YouTube link. Original brief: `plan.md`.

- **Run**: no build step — open `index.html` in a browser. Deploys via GitHub Pages on push to `main`.
- **Adding a card**: drop the PNG in `CardImages/Default Cards/` or `CardImages/Sports/`, then add an entry to the `cards` array in the `<script>` at the bottom of `index.html` (filenames have spaces/parens — copy them exactly).
- **Colors**: dark navy/blue scheme from `colorSchemeReference.png`, defined as CSS variables at the top of `index.html`.
- Keep changes simple and the tone kid-friendly; this is a small site for a small audience.
