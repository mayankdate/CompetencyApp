# AI Working Agreement — Competency App

> **Paste this file (or point to it) at the start of every AI-assisted session
> on this project.** It restores context and sets the rules so the project
> stays coherent across hundreds of conversations and possible maintainer
> changes. Humans contributing should follow it too.

---

## 📋 Copy-paste this into a new conversation

> The block below is the quick session-starter. Best practice is to also
> attach the four `docs/` files as Project knowledge — pasted links only help
> if the assistant actually fetches them, whereas attached knowledge is always
> available. Before relying on the links, confirm the repo is public and the
> branch is `main`, and open one link in a browser to check it resolves.

```
This is the CompetencyApp project — a mock health-record PWA for assessing
digital competency of frontline health workers (ASHAs/ANMs) in India.

Before giving technical advice, get oriented using the project docs. If they
are attached as project knowledge, use those. Otherwise, fetch them:

- Project brief (the why, settled decisions):
  https://raw.githubusercontent.com/mayankdate/CompetencyApp/main/docs/PROJECT_BRIEF.md
- Working agreement (how to contribute — READ THIS):
  https://raw.githubusercontent.com/mayankdate/CompetencyApp/main/docs/AI_WORKING_AGREEMENT.md
- Decisions log (what's already decided — don't reopen these):
  https://raw.githubusercontent.com/mayankdate/CompetencyApp/main/docs/DECISIONS.md
- Architecture (how the code works):
  https://raw.githubusercontent.com/mayankdate/CompetencyApp/main/docs/ARCHITECTURE.md

Key rules: don't reopen settled decisions without flagging the trade-off;
stay within the settled stack (vanilla JS, PWA, local-first, manual CSV
export, GitHub Pages, no build step); and treat no code change as complete
until its docs are updated in the same change (see the working agreement).

I am new to programming but comfortable with R and VSCode — explain steps
concretely and prefer no-build, no-terminal solutions.
```

---

## Start-of-session checklist (for the AI assistant)

Before proposing or writing anything, read, in this order:

1. **`docs/PROJECT_BRIEF.md`** — the goal, users, constraints, and settled
   decisions. This is the context you lack because you have no memory of past
   sessions.
2. **`docs/DECISIONS.md`** — what has already been decided and rejected. **Do
   not reopen settled decisions** unless the lead explicitly asks.
3. **`docs/ARCHITECTURE.md`** — how the current code works.
4. The relevant code files themselves.

If the lead hasn't provided these, ask for them (or for the repo) before
giving substantive technical advice. Guessing from a blank slate is how this
project drifts.

---

## The core rule: no change is "done" until its docs are updated

Every time you deliver code, your deliverable **must include** the matching
documentation updates, in the same change:

- **Code** — written and **well-commented** (explain *why*, not just *what*;
  assume the reader is a capable beginner).
- **`ARCHITECTURE.md`** — update the affected section (file description, data
  model, metric definition, lifecycle, etc.).
- **`DECISIONS.md`** — add a dated entry **if a real design choice was made**
  (something with alternatives that were weighed).
- **`README.md`** — touch only if how to run/deploy/structure changed.
- **`service-worker.js` `CACHE_NAME`** — bump the version **if any cached file
  changed** (HTML/CSS/JS/manifest). This is easy to forget and breaks updates
  in the field if missed.

If you write code but skip the docs, the change is incomplete. Call this out
explicitly in your response so the lead can hold the line.

---

## How to work, given the lead's context

The lead is **new to programming** but competent with R, data analysis, and
running AI-generated scripts, and works in **VSCode**. Therefore:

- **Explain steps concretely**, in order, at a beginner-friendly level. Assume
  no prior app-dev or Git knowledge unless shown otherwise.
- **Prefer no-build, no-terminal solutions.** If you're about to suggest
  `npm install`, a bundler, or a framework, stop and check it's truly needed —
  usually it isn't for this project (see PROJECT_BRIEF settled decisions).
- **Give whole files or clearly-located edits**, not vague fragments.
- **One coherent step at a time**; don't dump a large refactor unprompted.

---

## Style and scope guardrails

- Stay within the settled stack (vanilla JS, PWA, local-first, manual export,
  GitHub Pages). If you believe a settled decision should change, say so
  explicitly and explain the trade-off — don't just quietly do it differently.
- Keep the UI simple and forgiving; the subjects may have limited digital
  literacy.
- Don't add real patient data or networked data collection (out of scope).
- Favour readability over cleverness; this code will be maintained by
  non-experts with AI help.

---

## End-of-session habit (for the lead)

After changes are made:

1. Confirm the docs above were updated alongside the code.
2. Bump `CACHE_NAME` if a cached file changed.
3. In VSCode Source Control: **stage → commit (clear message) → push**.
4. If a decision was made, check it landed in `DECISIONS.md`.

Following this every time is what keeps the repo self-documenting and the
project handover-ready.
