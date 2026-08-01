# public-projects

A monorepo of independent published projects — browser tools deployed to GitHub Pages, plus the native Quill app. Each project is self-contained with no cross-dependencies.

```
public-projects/
├── SpacePlanner/        # Interior design floor planner
├── WFI/                 # Wake County NC restaurant inspection lookup
├── Quill/               # Cross-platform markdown editor (Tauri + Milkdown)
├── FOT/                 # FOT trading-card showcase site (static, GitHub Pages)
├── memory/              # Claude's auto-memory for this repo
└── CLAUDE.md            # This file (directory overview)
```

## Projects at a Glance

| Project | Purpose | Tech | GitHub Pages URL |
|---------|---------|------|------------------|
| **SpacePlanner** | 2D floor plan design tool | HTML/CSS/JS (Konva.js) | https://mutantspoon.github.io/public-projects/SpacePlanner/ |
| **WFI** | Restaurant sanitation inspection search | Python scraper + static HTML | https://mutantspoon.github.io/public-projects/WFI/ |
| **Quill** | WYSIWYG markdown editor | Tauri (Rust) + Milkdown | Native app (.exe, .app) |
| **FOT** | Trading-card showcase site | Static HTML + image assets | https://mutantspoon.github.io/public-projects/FOT/ |

## Quick Navigation

- **Working on SpacePlanner?** See `SpacePlanner/CLAUDE.md` for the build hook, selection architecture, and the .layout format tools
- **Working on WFI?** See `WFI/CLAUDE.md` for scraper workflow, data refresh, and site structure
- **Working on Quill?** See `Quill/CLAUDE.md` for build/run, AI comment system, and test harnesses
- **Working on FOT?** See `FOT/CLAUDE.md` — static card site built with my son

## Deployment

Push to `main` auto-deploys the static sites (SpacePlanner, WFI, FOT) via GitHub Pages. Quill is a native app, built/released separately.
