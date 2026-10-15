# CompetencyApp: contributor and AI coding guidance

## Purpose

CompetencyApp is a mock health-record Progressive Web App (PWA) for ASHA and
ANM competency assessment training. It demonstrates a structured assessment
workflow using pure HTML, CSS, and JavaScript — no backend, no build step.

This app uses **only synthetic, fictional data**. No real patient records, no
PII, and no clinical decisions should ever be stored in or derived from this app.

## Architecture

```
CompetencyApp/
├── index.html          ← entry point and main shell
├── css/                ← stylesheets
├── js/                 ← application logic (vanilla JS)
├── docs/               ← additional static pages
├── service-worker.js   ← PWA offline cache
├── manifest.json       ← PWA manifest
└── .gitignore
```

All logic is in `js/`. The app runs entirely in the browser with no build
toolchain. Open `index.html` directly in a browser or serve it with any
static HTTP server.

## Service worker cache

Whenever you add, remove, or rename a file that the service worker caches,
you **must** bump `CACHE_NAME` in `service-worker.js`. Failing to do so
causes users to receive stale assets from the old cache. The version string
format is `competency-app-v<N>`; increment `N` for every change.

## Commands

```bash
# Serve locally (any static server works)
python -m http.server 8000
# then open http://localhost:8000
```

## Change guidelines

- Do not introduce a build step, bundler, or package manager unless the owner
  explicitly asks. Keep it a single-directory static site.
- No real patient data. All assessment scenarios use synthetic cases.
- Update `service-worker.js`'s `CACHE_NAME` and cached file list whenever
  the cached asset set changes.
- Test on Chrome and a mobile viewport before committing; the PWA is designed
  for field use on phones.
