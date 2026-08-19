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

## 3. The data model

One assessment = one **record object**, stored under a string key (its `id`).
Current shape:

```js
{
  id: 1699999999999,                 // ms timestamp, unique-enough key
  savedAt: "2026-08-19T16:07:00.000Z",
  patientName: "Asha Devi",          // data the worker entered
  nameFieldTimeMs: 4213              // a captured metric
}
```

As fields and metrics are added, this object gains properties. The CSV export
column list in `app.js` (section 6) must be updated to include them.

---

## 4. How a metric is captured (the pattern)

Every behavioural metric follows the same idea, shown by the name-field timer:

1. Listen for an event (`focus`) to mark a start time.
2. Listen for an end event (`blur`, or the Save click) to compute the value.
3. Store the value as a property on the record when saving.

Future metrics (edit counts, error flags, field order, total time) are
variations on this. Keep each metric's capture logic close to the field it
measures, and document its meaning here when added.

---

## 5. Offline / update lifecycle (important)

The service worker serves **cached** files, so devices keep running the
version they cached until the cache name changes.

**Therefore: every time you change any file in `FILES_TO_CACHE`, bump
`CACHE_NAME` in `service-worker.js`** (e.g. `competency-app-v1` → `-v2`),
then commit and push. On their next online visit, devices fetch the new
version; the `activate` step deletes the old cache.

If you forget to bump the version, interviewers may keep running an old build
even after you deploy a fix.

---

## 6. Deployment pipeline

1. Edit files locally (VSCode + Live Server to preview).
2. Bump `CACHE_NAME` if a cached file changed.
3. Stage → commit → push to `main` (VSCode Source Control panel).
4. GitHub Pages rebuilds automatically (~1–2 min).
5. Live at `https://mayankdate.github.io/CompetencyApp/`.

---

## 7. Known gaps / TODO (technical)

- App icons referenced by the manifest do not exist yet (app still runs).
- No interviewer/session ID on records yet — needed to attribute exports.
- CSV column list is manual — consider auto-deriving it from record keys.
- No schema/versioning on records yet — worth adding before large-scale field
  use so exports from different app versions can be told apart.
