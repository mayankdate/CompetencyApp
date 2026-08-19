# Project Brief — Competency App

> **This is the stable context document.** It captures the *why* behind the
> project and the decisions that are settled. It changes rarely. If you are
> an AI assistant starting a new conversation about this project, read this
> file first — it restores the context you would otherwise lack.

---

## What we are building

A **mock health-record web app** that imitates a real Indian public-health
reporting app (such as **UWIN**). It is not a real health tool. It is a
**measurement instrument** for a research study.

## Why (the research goal)

We are running a **competency assessment of frontline health workers** in the
Indian public health system — **ASHAs, ANMs, and similar cadres**. We want to
learn:

1. Their level of **digital competency** when using health reporting apps.
2. The **barriers** they face when using apps like UWIN.

During a competency survey, an interviewer sits with a health worker, gives
them a **mock case of a fake patient**, and asks them to fill in that
patient's record in this app. The app looks and behaves vaguely like UWIN.
While they do this, the app **silently captures interaction metrics** — time
per field, edits, errors, order of completion, etc. These metrics are the
data of the study; the app is a proxy for real digital-tool use.

## Who the users are

- **Primary subjects:** frontline health workers (ASHAs/ANMs), who may have
  **limited digital literacy**. The UI must be simple, forgiving, and close
  to what they would see in a real reporting app.
- **Operators:** trained **interviewers/enumerators** who are physically
  present for every assessment, manage the device, and handle data export.

## Field constraints (these shape every technical decision)

- **Scale:** 500–1000+ assessments, possibly more.
- **Connectivity:** unreliable/absent internet at assessment sites. The app
  **must work fully offline**, for **many assessments per device**, across a
  full day with no connection.
- **Devices:** interviewers' own phones — assume **low-end Android**.
- **An interviewer is always present** during the assessment.

## Settled decisions (do NOT relitigate — see DECISIONS.md for detail)

These were chosen deliberately for this project's constraints and the lead's
skill level (competent with R/data analysis and AI-assisted scripting; **new
to app development and programming**). Treat them as fixed unless the lead
explicitly reopens them.

1. **Web app (PWA), not a native Android app.** No app store, no APK; just a
   URL that installs to the home screen and works offline.
2. **Plain HTML/CSS/vanilla JavaScript. No frameworks** (no React etc.).
   Keeps the codebase readable and debuggable by a beginner + AI.
3. **Local-first storage** via IndexedDB (through the `localforage` library).
4. **Manual CSV export** as the data-collection model — not a live backend or
   automatic sync. The interviewer exports and sends files to the research
   team. (A backend/sync model was considered and deferred as too fragile for
   the field conditions and skill level.)
5. **Hosted free on GitHub Pages** from the `main` branch.
6. **No build step / no Node tooling.** Files run directly; developed with
   VSCode + Live Server.

## What success looks like

- Interviewers can install the app once, run many assessments offline, and
  export clean CSVs the research team can merge and analyse in R.
- The captured metrics actually answer the research questions about digital
  competency and barriers.
- The project is documented well enough that **a new maintainer could take
  over** from these docs and the commented code alone.

## Explicitly out of scope (for now)

- Real patient data (everything is a mock case).
- Automatic/networked data sync (manual export instead).
- Native app / app-store distribution.
- Formal ethics/data-governance implementation (to be confirmed separately
  before field deployment; noted, not yet built).

## Current phase

**Phase 2 → 3 transition.** The technical skeleton is proven end-to-end
(offline, storage, export, PWA install on a real device). Next is designing
the real UWIN-like fields and the mock patient case, then expanding telemetry.
