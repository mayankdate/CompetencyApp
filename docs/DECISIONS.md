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
