# Architecture — Competency App

> **This is the handover document.** It explains how the code works in enough
> detail that a new maintainer (or an AI assistant) can understand and safely
> change it. **Keep it current:** whenever code changes, update the matching
> section here in the same commit. (See `AI_WORKING_AGREEMENT.md`.)

---

## 1. Big picture

The app is a **static website** (no server-side code) that behaves like an
installable, offline-capable app via **PWA** technology. It runs entirely in
the browser on the interviewer's phone.

```
   ┌─────────────────────────── Phone (offline-capable) ───────────────────────────┐
   │                                                                                 │
   │   index.html  ──loads──▶  css/style.css                                         │
   │        │                  js/app.js  ──uses──▶  localforage ──▶ IndexedDB       │
   │        │                                                        (saved records) │
   │        └──registers──▶  service-worker.js ──caches──▶ all app files (offline)   │
   │                                                                                 │
   │   Interviewer taps "Export" ──▶ app.js builds CSV ──▶ file downloads            │
   └─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                        CSV sent to research team (email/WhatsApp/hub)
                                          │
                             Merged & analysed in R (separate project)
```

There is **no backend**. Data is created and stored on-device, and leaves
only as a manually-exported CSV.

---

## 2. Files, one by one

### `index.html` (root)
The single page. Holds the form (currently one field), the interviewer
controls (save/export/clear), and the status line. Loads `localforage` from
a CDN, then `js/app.js`. **Must stay at root** (GitHub Pages homepage).

### `css/style.css`
All styling. System fonts, simple layout, touch-friendly buttons, tuned to
render well on low-end Android. Add a commented section per new component.

### `js/app.js`
All application logic. Currently one file, organised into numbered sections:

1. **Storage setup** — configures `localforage` (our IndexedDB wrapper).
2. **Element references** — grabs page elements once for reuse.
3. **Telemetry** — the name-field timer; the template for all future metrics.
4. **Save** — builds a `record` object and stores it locally.
5. **Count** — shows how many records are stored.
6. **Export CSV** — gathers records, builds CSV text, triggers download.
7. **Clear all** — wipes local storage (guarded by confirm()).
8. **Status helper** — transient on-screen messages.
9. **Service worker registration** — turns on offline support.
10. **Init** — shows the count on load.

Will be split into modules (e.g. `storage.js`, `telemetry.js`) once it grows
large enough that splitting clearly helps. Not yet.

### `service-worker.js` (root)
Makes the app work offline. Caches all listed files on install, serves them
cache-first, and cleans up old caches on activate. **Must stay at root** so
its scope covers the whole app.

### `manifest.json` (root)
PWA configuration: app name, colours, icons, and `display: standalone` (so it
opens fullscreen like a native app). Enables "Add to Home Screen".

### `assets/`
App icons (`icon-192.png`, `icon-512.png` — referenced by the manifest, not
yet created) and, later, mock-case materials.

### `docs/`
Project documentation (this file and its siblings).

---

## 3. Two-layer design (meta screen + form screen)

The app has **two screens**, both in `index.html` as `<section>`s, with JS
showing one at a time (a simple single-page pattern — no framework/router):

- **Meta screen** (`#metaScreen`) — the **interviewer's** control screen.
  Enter + confirm respondent ID, start, export, guarded clear, version.
- **Form screen** (`#formScreen`) — the **health worker's** record screen,
  styled to look like a **real health reporting app**: an app bar with a
  hamburger (☰), then the form fields. No research language is visible on
  the form body.

**Hamburger menu = interviewer controls + pause.** Tapping ☰ slides in a pane
(`#menuPane`) with Resume / End & save / Discard, and **auto-pauses telemetry**
(open timers flushed, counting stopped) so an interruption isn't recorded as
thinking time. Closing via Resume (or tapping the backdrop) un-pauses. This
keeps the form authentic while giving the interviewer session control. The
form's own green **Submit** button behaves like End & save, so it feels real.

## 4. The data model

One assessment = one **record object**, stored under a string key (its `id`).
The fields captured are defined once in the `FORM_FIELDS` array in `app.js`;
adding a field means one line there plus the matching HTML input. Current
shape (values plus per-field telemetry columns):

```js
{
  id: 1699999999999,                 // ms timestamp, unique local key
  respondentId: "SVY-04821",         // typed by interviewer; links to CAPI
  startedAt: "...", savedAt: "...",  // form open / save times

  // --- field values ---
  beneficiaryName, age, sex, mobile, village, visitDate, vaccine, dose,
  adverseReaction,                   // "Yes"/"No"

  // --- per-field telemetry (one pair per field) ---
  age_ms, age_focusCount,            // total focused time + times focused
  // ...same _ms / _focusCount pair for every field...
}
```

The **respondent ID** is entered twice on the meta screen and must match
before an assessment can start.

The CSV export builds its columns from the **union of all keys across
records**, so new fields appear automatically without editing the exporter.

## 4a. Respondent ID, export, and the guarded clear

- **Respondent ID:** interviewer types it (from the CAPI survey), entered
  twice and confirmed equal. Never auto-generated — it must match the main
  survey exactly.
- **Export filename:** `competency_YYYY-MM-DD_<n>cases_HHMM.csv`, so the date,
  case count, and time are visible and repeat exports don't overwrite.
- **Duplicate IDs:** the export adds a `duplicateId` column flagging any
  respondent ID that appears in more than one record, to catch in analysis.
- **Clear all (guarded):** lives only on the meta screen and runs a safety
  sequence — confirm → passcode (`CLEAR_PASSCODE` in `app.js`, a speed bump,
  not real security) → **forced pre-clear CSV export** → final confirm → wipe.
  Data is always saved to a file before anything is deleted.

---

## 4b. How a metric is captured (the pattern)

Every behavioural metric follows the same idea, shown by the name-field timer:

1. Listen for an event (`focus`) to mark a start time.
2. Listen for an end event (`blur`, or the Save click) to compute the value.
3. Store the value as a property on the record when saving.

Future metrics (edit counts, error flags, field order, total time) are
variations on this. Keep each metric's capture logic close to the field it
measures, and document its meaning here when added.

---

## 5. Versioning (single source of truth, kept in two places)

The version string appears in **two files that must be kept identical**:

- `APP_VERSION` in `js/app.js` — shown on the meta screen, and used to check
  that every interviewer's device is on the same build.
- `APP_VERSION_TAG` in `service-worker.js` — used to name the offline cache
  (`competency-app-<version>`), which is what forces devices to pick up a new
  build.

**Why two places and not one:** the service worker loads before `app.js` and
can't share a variable with it without a build step, which this project
deliberately avoids. So the two are synced **by hand**. The format includes a
date (`"v2 — 2026-08-19"`) so drift is obvious at a glance.

**When you deploy any change to a cached file, update BOTH strings to the same
new value**, then commit and push. The meta screen also shows whether the
service worker is active ("offline-ready" vs "not yet offline"), so you can
confirm a device is both on the right version and properly cached offline.

## 6. Offline / update lifecycle (important)

The service worker serves **cached** files, so devices keep running the
version they cached until the cache name changes.

**Therefore: every time you change any file in `FILES_TO_CACHE`, bump
`CACHE_NAME` in `service-worker.js`** (e.g. `competency-app-v1` → `-v2`),
then commit and push. On their next online visit, devices fetch the new
version; the `activate` step deletes the old cache.

If you forget to bump the version, interviewers may keep running an old build
even after you deploy a fix.

---

## 7. Deployment pipeline

1. Edit files locally (VSCode + Live Server to preview).
2. Bump `CACHE_NAME` if a cached file changed.
3. Stage → commit → push to `main` (VSCode Source Control panel).
4. GitHub Pages rebuilds automatically (~1–2 min).
5. Live at `https://mayankdate.github.io/CompetencyApp/`.

---

## 8. Known gaps / TODO (technical)

- App icons referenced by the manifest do not exist yet (app still runs).
- No interviewer/session ID on records yet — needed to attribute exports.
- CSV column list is manual — consider auto-deriving it from record keys.
- No schema/versioning on records yet — worth adding before large-scale field
  use so exports from different app versions can be told apart.
