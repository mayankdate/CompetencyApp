# Decisions Log — Competency App

> **Append-only.** Each entry records a decision, why it was made, and what
> was rejected. This is what stops settled questions from being reopened every
> conversation. When an AI assistant proposes something already decided here,
> point it to the relevant entry.
>
> Newest entries at the top. Format:
>
> ```
> ## YYYY-MM-DD — Short title
> **Decision:** what we chose.
> **Why:** the reasoning.
> **Rejected:** alternatives considered and why not.
> ```

---

## 2026-08-19 — v0.05: telemetry redesign (response-time model)

**Decision:** Replace focus-duration-as-primary-metric with a response-time
model. Capture: `totalTimeMs` (whole assessment); per field
`<field>_responseAtMs` (offset from form-open to FIRST response; blank = NA)
and `<field>_changedAfter` (changed after first answer? hesitation signal);
and, **for typed fields only**, `<field>_activeMs` (focus time as a
typing-effort proxy). All ms measured on a pause-excluding **active-time
clock**. No keystrokes, no raw event log, no date/time metrics. Adverse
reaction becomes an explicit **Yes/No radio** so blank = unanswered.
**Why:** "Focus" is a technical state, not attention — a worker can read/
think about an unfocused field, and focus time is near-useless for radio/
select/date. Response-time offsets from a common clock behave uniformly
across all field types and better proxy engagement/difficulty; differences
between fields approximate transition time. Excluding paused time keeps
interruptions out of every measure. The lead audited and approved this model.
**Rejected:** A full raw timestamped event log (richer but bigger exports and
more analysis burden than wanted). Keystroke capture (declined — mild
privacy/volume cost for little needed gain). Keeping focus time for all
fields (unreliable for non-typed inputs). Raw wall-clock totals including
pauses (would let interruptions inflate the measures).

## 2026-08-19 — v0.04: full field set, hamburger menu, version scheme

**Decision:** (a) Expand the form to a UWIN-like immunization record —
beneficiary name, age, sex, mobile, village, date of visit, vaccine, dose,
adverse reaction — spanning varied input types (text/number/tel/radio/date/
select/checkbox), since different widgets expose different competency
barriers. (b) Hide interviewer controls behind a **hamburger menu** on the
form screen so it looks like a real health app; opening the menu **auto-pauses
telemetry**. (c) Capture **per-field** timing + focus counts. (d) Adopt a
`v0.NN` version scheme for proof-of-concept builds; current build is **v0.04**.
**Why:** The form must feel authentic to the health worker (no visible
research controls), the interviewer still needs pause/stop/save without
leaving the screen, and varied field types plus per-field telemetry are what
actually answer the research questions.
**Rejected:** A visible interviewer bar on the form (breaks authenticity). A
free "peek at meta" that navigates away mid-form (risks losing the in-progress
entry — leaving is always an explicit resume/save/discard choice instead).

## 2026-08-19 — Version display on meta screen

**Decision:** Show the running version on the meta screen (`APP_VERSION` in
`app.js`), plus whether the service worker is active. The version string is
kept in two files — `APP_VERSION` (app.js, for display) and `APP_VERSION_TAG`
(service-worker.js, for the cache name) — synced **by hand** and kept
identical. Format includes a date, e.g. `"v2 — 2026-08-19"`.
**Why:** With many devices in the field, we need to confirm all interviewers
run the same build, especially after pushing an update mid-fieldwork. Tying
the displayed version to the cache-naming version means "what you see" equals
"what's actually running".
**Rejected:** A hardcoded version number separate from the cache name (would
drift out of sync). A single shared constant across both files (would require
a build step, which is a settled no). Auto-generating from git (no build
step / not available client-side).

## 2026-08-19 — Two-layer design (meta + form) and data safeguards

**Decision:** Split the app into a **meta screen** (interviewer: enter/confirm
respondent ID, start, export, guarded clear) and a **form screen** (health
worker: the record + telemetry). Respondent ID is **typed by the interviewer**
from the main CAPI survey, entered twice and confirmed equal; never
auto-generated. Export filename is `competency_YYYY-MM-DD_<n>cases_HHMM.csv`
and flags duplicate IDs in a column. **Clear** lives only on the meta screen
and requires: confirm → passcode → forced pre-clear export → final confirm →
wipe.
**Why:** Separates who touches what (phone handover boundary), ties every
record to the CAPI survey for reconciliation, and makes accidental data loss
very hard (fat-finger protection was an explicit requirement).
**Rejected:** Auto-generating the respondent ID (would break reconciliation
with the CAPI survey). A single-tap clear (too easy to trigger accidentally).
A real/secure passcode system (client-side code can't hold real secrets;
that's a future cloud/auth concern, not needed to stop accidental taps).

## 2026-08-19 — Documentation & continuity system

**Decision:** Adopt a four-document system in the repo — `PROJECT_BRIEF.md`
(stable why), `ARCHITECTURE.md` (how the code works), `DECISIONS.md` (this
log), and `AI_WORKING_AGREEMENT.md` (contribution process). The README is a
lean front door pointing to them. Docs must be updated in the same commit as
the code that changes them.
**Why:** The project will span hundreds of conversations and may change
maintainers. Claude has no memory between chats; the repo must *be* the
memory. This also makes human handover possible.
**Rejected:** Relying on the README alone (mixes stable and churning content,
rots quickly). Relying on conversation history (not portable, not persistent).

## 2026-08-19 — Rename to CompetencyApp

**Decision:** Project/repo name is **CompetencyApp**; live at
`https://mayankdate.github.io/CompetencyApp/`.
**Why:** Reflects the actual purpose (competency assessment) rather than the
placeholder "health-mock" name.
**Rejected:** Keeping "health-mock" (placeholder, less descriptive).

## 2026-08-19 — Proper folder structure from the start

**Decision:** Use `css/`, `js/`, `assets/`, `docs/` folders, with
`index.html`, `service-worker.js`, and `manifest.json` at root. Add README and
`.gitignore` from day one. Keep `app.js` as one file until it is large enough
that splitting genuinely helps.
**Why:** The lead wanted a near-final repo layout. Establishing structure
early avoids a later refactor. Two files must stay at root for technical
reasons (Pages homepage; service-worker scope).
**Rejected:** Flat layout (fine for a 4-file toy, not for an evolving
project). Splitting JS immediately (premature; empty files hurt navigation).

## 2026-08-19 — Core technical stack

**Decision:** PWA web app; plain HTML/CSS/vanilla JS, no framework;
local-first storage via IndexedDB (`localforage`); manual CSV export; hosted
on GitHub Pages; no build step.
**Why:** Fits unreliable-connectivity field conditions (offline-first),
large scale (hundreds of assessments per device), low-end Android devices,
and a lead who is new to programming but works well with AI. Manual export
removes an entire class of failure (backend, auth, sync).
**Rejected:** Native Android app (needs app store, APKs, harder to build and
update). React/frameworks (build tooling and complexity a beginner doesn't
need). Live backend / auto-sync (fragile in poor connectivity; more moving
parts). Off-the-shelf form tools like ODK/KoboToolbox/SurveyCTO (cannot
capture the per-field behavioural telemetry that is the point of the study).
