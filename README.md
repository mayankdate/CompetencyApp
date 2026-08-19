# Competency App — Mock Health Record

A mock health-record web app used to assess the **digital competency** of
frontline health workers (ASHAs, ANMs, etc.) in the Indian public health
system. It mimics the look and basic functionality of a real reporting app
(e.g. UWIN). During a competency survey, a health worker fills in a record
for a **mock patient case**, and the app silently captures interaction
metrics (time per field, edits, errors) for later analysis.

This repository contains **only the app** that runs on interviewers'
devices. Collected data leaves each device as an exported CSV; analysis of
that data lives in a **separate** project.

**Live app:** https://mayankdate.github.io/CompetencyApp/

---

## Documentation map

This README is the front door. The detailed, evolving documentation lives
in [`docs/`](docs/). Read these in order if you are new (human or AI):

| File | Purpose |
|------|---------|
| [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) | **The why.** Research goal, users, constraints, settled decisions. The stable context. Read this first. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **The how.** Every file explained, data flow, how metrics are captured. The handover document. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | **The choices.** Running, append-only log of decisions and what was rejected, so settled questions stay settled. |
| [`docs/AI_WORKING_AGREEMENT.md`](docs/AI_WORKING_AGREEMENT.md) | **The process.** Rules for how AI assistants (and humans) contribute, including the doc-update discipline. Paste at the start of AI sessions. |

---

## Status

**Skeleton build.** Proves the end-to-end plumbing: a form field, one
captured metric, local storage that survives offline, PWA install, and
CSV export. Confirmed working offline on a real Android device.

Real UWIN-like fields, the mock patient case, and full telemetry come next.

---

## Project structure

```
CompetencyApp/
├── index.html            App entry point (must stay at root)
├── service-worker.js     Offline caching (must stay at root — SW scope rule)
├── manifest.json         PWA config for "Add to Home Screen" (root by convention)
├── README.md             This file
├── .gitignore
├── css/
│   └── style.css
├── js/
│   └── app.js            All logic for now; will split as it grows
├── assets/               App icons and mock-case materials
└── docs/                 Project documentation (see map above)
```

Two files are pinned to the root for technical reasons: `index.html` is the
homepage GitHub Pages serves, and `service-worker.js` must sit at the root
so it can cache the whole app.

---

## Running locally

1. Open this folder in VSCode.
2. Install the **Live Server** extension.
3. Right-click `index.html` → **Open with Live Server**.
4. The app opens at `http://127.0.0.1:5500` (or similar).

Offline features only work over HTTPS or localhost. Live Server counts as
localhost; opening the raw file with `file://` will **not** register the
service worker.

---

## Deploying

Hosted free via **GitHub Pages** from the `main` branch, root folder.
Pushing to `main` rebuilds the live site within a minute or two.

**Every time you change a cached file** (HTML/CSS/JS/manifest), bump the
`CACHE_NAME` version in `service-worker.js` (e.g. `-v1` → `-v2`) so devices
pick up the new version instead of the old cached one. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why.

---

## The everyday Git loop (in VSCode)

After editing files, in the **Source Control** panel:

1. **Stage** the changed files (the `+`).
2. **Commit** with a short message describing the change.
3. **Sync / Push** to send it to GitHub.

If you changed a cached file, bump `CACHE_NAME` *before* committing.

---

## Data & privacy

No data leaves a device automatically. All captured data is behavioural
(interaction metrics on a *mock* patient) — no real patient information is
entered. Formal data-handling/ethics requirements to be confirmed before
field deployment.

## To do (high level — see docs for detail)

- [ ] Add real app icons (`assets/icon-192.png`, `assets/icon-512.png`).
- [ ] Design the real UWIN-like fields and the mock patient case.
- [ ] Expand telemetry (per-field timing, edit counts, errors, order).
- [ ] Add interviewer/session ID for attributing exported records.
- [ ] Field-test on a representative low-end Android phone at scale.
- [ ] Write the interviewer instruction sheet (install + run + export).
