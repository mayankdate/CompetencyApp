# Health Mock — Digital Competency Assessment

A mock health-record web app used to assess the digital competency of
frontline health workers (ASHAs, ANMs, etc.) in the Indian public health
system. It mimics the look and basic functionality of a real reporting app
(e.g. UWIN). During a competency survey, a health worker fills in a record
for a mock patient case, and the app silently captures interaction metrics
(time per field, edits, errors) for later analysis.

This repository contains **only the app** that runs on interviewers'
devices. Collected data leaves each device as an exported CSV; analysis of
that data lives in a **separate** project.

## Status

Skeleton build. Proves the end-to-end plumbing: a form field, one captured
metric, local storage that survives offline, and CSV export. Real fields,
the mock case, and full telemetry come next.

## How it works (the short version)

- Runs entirely in the phone's browser — no native app, no app store.
- After the first load it works **fully offline** (Progressive Web App).
- Each completed assessment is saved locally on the device (IndexedDB).
- The interviewer exports all stored assessments as a CSV when convenient.
- Data is collected by gathering those CSV files (manual export model).

## Project structure

```
health-mock/
├── index.html            App entry point (must stay at root)
├── service-worker.js     Offline caching (must stay at root — SW scope rule)
├── manifest.json         PWA config for "Add to Home Screen" (root by convention)
├── README.md             This file
├── .gitignore
├── css/
│   └── style.css
├── js/
│   └── app.js            All logic for now; will split as it grows
└── assets/
    └── (app icons and mock-case materials go here)
```

Two files are pinned to the root for technical reasons: `index.html` is the
homepage GitHub Pages serves, and `service-worker.js` must sit at the root
so it can cache the whole app (a service worker can only control files at or
below its own folder).

## Running locally

1. Open this folder in VSCode.
2. Install the "Live Server" extension.
3. Right-click `index.html` → "Open with Live Server".
4. The app opens in your browser at `http://127.0.0.1:5500` (or similar).

Note: offline features (service worker) only work over HTTPS or localhost.
Live Server counts as localhost, so it works there; opening the raw file
with `file://` will not register the service worker.

## Deploying

Hosted free via **GitHub Pages** from the `main` branch, root folder.
Once enabled, the app is live at:

`https://<username>.github.io/health-mock/`

Interviewers open that URL once, then use "Add to Home Screen" to install
it. After the first load it works offline.

**When you change any cached file** (HTML/CSS/JS), bump the `CACHE_NAME`
version in `service-worker.js` (e.g. `health-mock-v1` → `-v2`) so devices
pick up the new version instead of the old cached one.

## To do

- [ ] Add real app icons (`assets/icon-192.png`, `assets/icon-512.png`)
      referenced by `manifest.json`.
- [ ] Design the real UWIN-like fields and the mock patient case.
- [ ] Expand telemetry (per-field timing, edit counts, errors, order).
- [ ] Add an interviewer/session ID so exported records can be attributed.
- [ ] Field-test offline behaviour on a representative low-end Android phone.
- [ ] Write the interviewer instruction sheet (install + run + export).

## Data & privacy

No data leaves a device automatically. All captured data is behavioural
(interaction metrics on a *mock* patient) — no real patient information is
entered. Formal data-handling/ethics requirements to be confirmed before
field deployment.
