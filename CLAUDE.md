# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**public-projects** is a monorepo of independent published projects (browser tools deployed to GitHub Pages, plus the native Quill app). Each project is self-contained with no cross-dependencies.

**Directory Structure:**
```
public-projects/
├── SpacePlanner/        # Interior design floor planner
├── WFI/                 # Wake County NC restaurant inspection lookup
├── Quill/               # Cross-platform markdown editor (Tauri + Milkdown)
├── FOT/                 # FOT trading-card showcase site (static, GitHub Pages)
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

- **Working on SpacePlanner?** See `SpacePlanner/CLAUDE.md` for build setup, architecture, and keyboard shortcuts
- **Working on WFI?** See `WFI/CLAUDE.md` for scraper workflow, data refresh, and site structure
- **Working on Quill?** See `Quill/CLAUDE.md` for dev setup, Tauri commands, and AI comment system
- **Working on FOT?** Static image-card site (built with my son); plain HTML/CSS + `CardImages/`

## General Guidelines

All projects follow these conventions:
- **Single responsibility**: Each tool does one thing well
- **Self-contained**: No shared dependencies or inter-project imports
- **Browser/native first**: No server required (except Quill is native)
- **GitHub Pages deployment**: Push to `main` auto-deploys (SpacePlanner, WFI only)

