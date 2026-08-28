# Database — Competency App

> **The database's handover document + running SQL log.** Same role for the
> Supabase/Postgres database that `ARCHITECTURE.md` plays for the app code.
> Every SQL statement we run against the database is recorded here, in order,
> so the live schema always has a written history someone can audit or replay.
>
> **Why this file matters:** we chose plain columns over a flexible JSON
> schema (see DECISIONS.md), which means **every new form field is a manual
> `ALTER TABLE` command**. If those aren't logged, the real table silently
> drifts from any description of it. This file is the append-only source of
> truth. When you run SQL in the Supabase SQL Editor, paste it here too.

---

## Provider & location

- **Provider:** Supabase (managed Postgres).
- **Region:** South Asia (Mumbai, `ap-south-1`) — chosen so data is
  physically hosted in India for compliance. Region is fixed at project
  creation and cannot be changed later; moving means recreating the project.
- **Data model:** plain columns (no JSON), by deliberate choice — easier to
  read, pull into R, and audit. Trade-off: adding a field later requires an
  `ALTER TABLE` (logged below).
- **Schema changes:** done by hand in the Supabase **SQL Editor** (not the
  CLI / GitHub migrations), to avoid build tooling while prototyping. All
  statements are recorded in this file so history is preserved anyway.

---

## Security model (summary — full policies in the "Security" section below)

The app is public (hosted on GitHub Pages), so the API key it carries is
public by necessity. Security therefore lives in **database rules**, not in
hiding the key:

- **Insert-only:** the public key may INSERT new rows and nothing else — no
  read, update, delete, or list. Even with the key, an outsider cannot
  download, alter, or wipe collected data; worst case is inserting junk rows.
- **Passphrase:** every insert must carry a passphrase given to the field
  team at training (never stored in the app source). Rotatable if leaked.
- **Local cache + CSV export remain** as the always-works fallback; the
  database is the primary destination, not the only copy.

---

## SQL log (run in order)

### 2026-08-21 — Create `assessments` table

Creates one row per completed assessment. Notes on design:
- `id`, `inserted_at` are DB-generated (app never sets them). `inserted_at`
  is server-side proof of when a row actually synced.
- `client_id` stores the device's own local record id (the app's ms
  timestamp), so duplicate syncs of the same assessment can be detected in
  analysis.
- Human-entered values are `text` (health data is messy; text never rejects
  a row). Machine-generated telemetry (`_ms`) is `integer` for clean
  analysis. `_changed_after` flags are `text` ("YES" or blank).
- Column names are `snake_case` (Postgres convention); the app's camelCase
  keys are mapped to these in the sync module.

```sql
create table assessments (
  id bigint generated always as identity primary key,
  inserted_at timestamptz not null default now(),
  passphrase text,
  client_id text,
  respondent_id text,
  total_time_ms integer,

  -- field values
  beneficiary_name text,
  age text,
  sex text,
  mobile text,
  village text,
  visit_date text,
  vaccine text,
  dose text,
  adverse_reaction text,

  -- telemetry: response-time offset (ms) per field; blank = NA
  beneficiary_name_response_at_ms integer,
  age_response_at_ms integer,
  sex_response_at_ms integer,
  mobile_response_at_ms integer,
  village_response_at_ms integer,
  visit_date_response_at_ms integer,
  vaccine_response_at_ms integer,
  dose_response_at_ms integer,
  adverse_reaction_response_at_ms integer,

  -- telemetry: changed-after-first-answer flag per field
  beneficiary_name_changed_after text,
  age_changed_after text,
  sex_changed_after text,
  mobile_changed_after text,
  village_changed_after text,
  visit_date_changed_after text,
  vaccine_changed_after text,
  dose_changed_after text,
  adverse_reaction_changed_after text,

  -- telemetry: active/typing time (ms) for typed fields only
  beneficiary_name_active_ms integer,
  age_active_ms integer,
  mobile_active_ms integer,
  village_active_ms integer
);
```

### 2026-08-21 — Security: enable RLS + insert-only + passphrase

Run in order. Concept: enabling RLS locks the table completely (deny all);
each policy then opens exactly one narrow door. We open only INSERT, and
only when the correct passphrase is present.

```sql
-- 1. Turn on Row Level Security. After this, ALL access is denied until a
--    policy allows it — the table goes from "wide open" to "locked".
alter table assessments enable row level security;
```

```sql
-- 2. (Interim) allow anonymous inserts. Replaced immediately by step 3.
--    Kept here for history; do not re-run.
create policy "anon can insert assessments"
  on assessments
  for insert
  to anon
  with check (true);
```

```sql
-- 3. Replace the loose policy with one that REQUIRES the passphrase.
--    The check runs inside the database, so it holds even if someone
--    bypasses the app and hits the API directly. Only INSERT is granted;
--    there is deliberately NO select/update/delete policy, so outsiders
--    can never read, alter, or wipe collected data.
drop policy "anon can insert assessments" on assessments;

create policy "anon can insert with passphrase"
  on assessments
  for insert
  to anon
  with check ( passphrase = 'meghalaya2026' );
```

**Passphrase:** currently `meghalaya2026` (placeholder). Given to the field
team at training; never stored in the app source. Rotatable: to change it,
re-run step 3's `create policy` with a new value (after dropping the old
policy), then re-train the team. A wrong/missing passphrase is rejected with
Postgres error `42501` (permission denied) — useful to recognise in sync logs.

**Final policy state:** exactly one policy on `assessments` —
`"anon can insert with passphrase"`, command INSERT, role anon.

### 2026-08-21 — Security test (verified working)

Ran from the SQL Editor as the `anon` role (`set local role anon;`) to
simulate the app's public key. Result confirmed the lock holds:

| Test | Passphrase sent | Result |
|------|-----------------|--------|
| 1 | none | **Rejected** (`42501` RLS violation) ✓ |
| 2 | wrong value | **Rejected** (`42501` RLS violation) ✓ |
| 3 | correct (`meghalaya2026`) | **Accepted** — one row inserted ✓ |

Table showed exactly the one valid row (`TEST-003`); rejected attempts never
landed. Test row subsequently deleted (as admin, via Table Editor — anon
cannot delete by design). Table is clean and ready for app connection.

---

## How to add a new field later (the routine)

When the form gains a field, do these in order:
1. Add the column(s) here as a new dated SQL entry and run them in the SQL
   Editor, e.g. `alter table assessments add column new_field text;`
2. Add the field to the app (`FORM_FIELDS` in `app.js` + the HTML input).
3. Update the sync module's column mapping so the new field is sent.
4. Update `ARCHITECTURE.md` (data model) in the same change.
