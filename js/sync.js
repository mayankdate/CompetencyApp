/*
  sync.js — pushes locally-stored assessments to the Supabase database.

  DESIGN (local-first with background sync):
  The app always saves each assessment to IndexedDB first (see app.js), so
  nothing depends on the network at save time. This module is the OPTIONAL
  extra that pushes those local records to the central database whenever a
  connection is available. If a push fails, the record simply stays local
  and is retried later — data is never lost. CSV export remains as a manual
  fallback regardless.

  SECURITY: the database is insert-only and requires a passphrase (entered
  by the interviewer, cached on the device). Every insert carries that
  passphrase; the database rejects any that don't. The Supabase URL and
  anon key below are PUBLIC by design — security lives in the database's
  Row Level Security policies, not in hiding these values.

  Each local record has a `synced` boolean. This module finds `synced:false`
  records, inserts them, and flips them to `synced:true` on success.
*/

// ============================================================
// 1. SUPABASE CONNECTION (public values — safe to ship)
// ============================================================
// >>> FILL THESE IN from Supabase dashboard: Project Settings -> API <<<
//   SUPABASE_URL      = your "Project URL"
//   SUPABASE_ANON_KEY = your "anon" / "publishable" key
// Both are public; do NOT use the secret/service_role key here.
const SUPABASE_URL = "https://pqodsibfleqbzamiacgn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lZ3VPsAJxoKz4nrXR12MmQ_p35-NfXY";

// The Supabase JS client (loaded from CDN in index.html as `supabase`).
// We create one client instance for the app to reuse.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// The table we insert into.
const SB_TABLE = "assessments";

// ============================================================
// 2. PASSPHRASE STORAGE (cached per device)
// ============================================================
// The interviewer types the passphrase once on the meta screen; we cache
// it in localforage so it persists across app restarts on this device.
const PASSPHRASE_KEY = "__device_passphrase__";

async function getPassphrase() {
  try { return (await localforage.getItem(PASSPHRASE_KEY)) || ""; }
  catch { return ""; }
}
async function setPassphrase(value) {
  await localforage.setItem(PASSPHRASE_KEY, value);
}

// ============================================================
// 3. COLUMN MAPPING (app record key -> database column)
// ============================================================
// Explicit and auditable: every field we send is listed here. The app uses
// camelCase; the database uses snake_case. When you add a form field later,
// add its mapping line(s) here AND the column in the database (DATABASE.md).
// Note: the local-only keys `id`, `synced` are handled specially below;
// `id` becomes `client_id` in the DB (the device's own record id).
const COLUMN_MAP = {
  respondentId: "respondent_id",
  totalTimeMs: "total_time_ms",

  // values
  beneficiaryName: "beneficiary_name",
  age: "age",
  sex: "sex",
  mobile: "mobile",
  village: "village",
  visitDate: "visit_date",
  vaccine: "vaccine",
  dose: "dose",
  adverseReaction: "adverse_reaction",

  // response-time offsets
  beneficiaryName_responseAtMs: "beneficiary_name_response_at_ms",
  age_responseAtMs: "age_response_at_ms",
  sex_responseAtMs: "sex_response_at_ms",
  mobile_responseAtMs: "mobile_response_at_ms",
  village_responseAtMs: "village_response_at_ms",
  visitDate_responseAtMs: "visit_date_response_at_ms",
  vaccine_responseAtMs: "vaccine_response_at_ms",
  dose_responseAtMs: "dose_response_at_ms",
  adverseReaction_responseAtMs: "adverse_reaction_response_at_ms",

  // changed-after flags
  beneficiaryName_changedAfter: "beneficiary_name_changed_after",
  age_changedAfter: "age_changed_after",
  sex_changedAfter: "sex_changed_after",
  mobile_changedAfter: "mobile_changed_after",
  village_changedAfter: "village_changed_after",
  visitDate_changedAfter: "visit_date_changed_after",
  vaccine_changedAfter: "vaccine_changed_after",
  dose_changedAfter: "dose_changed_after",
  adverseReaction_changedAfter: "adverse_reaction_changed_after",

  // active/typing time (typed fields only)
  beneficiaryName_activeMs: "beneficiary_name_active_ms",
  age_activeMs: "age_active_ms",
  mobile_activeMs: "mobile_active_ms",
  village_activeMs: "village_active_ms",
};

// Convert a local record into the row shape the database expects.
function toDbRow(record, passphrase) {
  const row = {
    passphrase: passphrase,          // required by the security policy
    client_id: String(record.id),    // device's own record id (dup detection)
  };
  for (const appKey in COLUMN_MAP) {
    let val = record[appKey];
    // Empty strings for numeric telemetry become null (blank = NA).
    if (val === "" || val === undefined) val = null;
    row[COLUMN_MAP[appKey]] = val;
  }
  return row;
}

// ============================================================
// 4. THE SYNC ROUTINE
// ============================================================
// Finds all unsynced records, pushes each, marks synced on success.
// Returns a small summary for the UI. Never throws — failures are counted.
let syncInProgress = false;

async function syncNow() {
  // Guard against overlapping runs (e.g. auto + manual at once).
  if (syncInProgress) return { skipped: true };
  syncInProgress = true;

  const result = { pushed: 0, failed: 0, remaining: 0, noPassphrase: false, offline: false };

  try {
    // Can't sync without a network.
    if (!navigator.onLine) { result.offline = true; return result; }

    const passphrase = await getPassphrase();
    if (!passphrase) { result.noPassphrase = true; return result; }

    // Gather unsynced records (skip the passphrase storage key).
    const unsynced = [];
    await localforage.iterate((value, key) => {
      if (key === PASSPHRASE_KEY) return;
      if (value && value.synced === false) unsynced.push(value);
    });

    // Push each one.
    for (const record of unsynced) {
      const row = toDbRow(record, passphrase);
      const { error } = await sb.from(SB_TABLE).insert(row);
      if (error) {
        result.failed += 1;
        // Leave record as synced:false so it retries next time.
      } else {
        record.synced = true;
        await localforage.setItem(String(record.id), record);
        result.pushed += 1;
      }
    }

    // Count anything still unsynced after this run.
    let remaining = 0;
    await localforage.iterate((value, key) => {
      if (key === PASSPHRASE_KEY) return;
      if (value && value.synced === false) remaining += 1;
    });
    result.remaining = remaining;
    return result;
  } finally {
    syncInProgress = false;
  }
}

// Count unsynced records without pushing (for the meta-screen display).
async function countUnsynced() {
  let n = 0;
  await localforage.iterate((value, key) => {
    if (key === PASSPHRASE_KEY) return;
    if (value && value.synced === false) n += 1;
  });
  return n;
}
