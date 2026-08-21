/*
  app.js — all application logic. Version v0.05.

  Responsibilities:
    1. Config + local storage (localforage / IndexedDB).
    2. Switch between the two screens (meta <-> form).
    3. Validate + carry the respondent ID from the meta screen.
    4. The form: capture field values + TELEMETRY (see model below).
    5. Hamburger menu = interviewer controls + pause (excluded from timing).
    6. Save each assessment locally, tagged with its respondent ID.
    7. Count, export (well-named CSV), guarded clear.
    8. Version display; service worker registration (offline).

  ============================================================
  TELEMETRY MODEL (v0.05) — read this before auditing numbers
  ============================================================
  All times are in milliseconds (ms). No wall-clock date/times are used
  as metrics. Every ms figure is measured on the ACTIVE-TIME CLOCK:
  elapsed assessment time with any PAUSED spans (interviewer menu open)
  removed. So all offsets are comparable and exclude interruptions.

  Captured per assessment:
    - totalTimeMs
        Active time from form-open (Start) to save (End/Submit).

  Captured per field:
    - <field>_responseAtMs
        Active-time offset from form-open to the moment the field FIRST
        received a response. Blank/NA if the field was never answered.
        NOTE: this is an offset-from-start, cumulative — later fields have
        larger values. Field-to-field differences approximate "time to get
        from one answer to the next". It is NOT a standalone duration.
    - <field>_changedAfter
        "YES" if the field's value changed at least once AFTER its first
        response (a hesitation/correction signal); "" otherwise.
    - <field>_activeMs   (TYPED fields only: name, age, mobile, village)
        Total focused ("cursor is in the field") time, a proxy for typing/
        editing effort. Only meaningful for typed inputs, so it is NOT
        captured for radio/select/date/checkbox fields.

  What is deliberately NOT captured: keystrokes, raw event logs, and any
  attention/eye signal (a browser cannot measure attention; "focus" only
  means "the active input", which is why we lean on response-time offsets
  that work uniformly across all field types).
*/

// ============================================================
// 0. CONFIG
// ============================================================
// SINGLE SOURCE OF TRUTH for the version. Shown on the meta screen AND
// (mirrored in service-worker.js as APP_VERSION_TAG) used to name the
// offline cache. Keep the two identical. Bump on every deploy of a cached
// file. Scheme: v0.NN for proof-of-concept builds.
const APP_VERSION = "v0.05";

// Speed bump guarding "Clear all data". NOT real security.
const CLEAR_PASSCODE = "wipe1234";

// Field definitions. `typed: true` means it's a text-like input that also
// gets _activeMs (focus time). Choice fields (radio/select/checkbox/date)
// get _responseAtMs and _changedAfter only.
const FORM_FIELDS = [
  { key: "beneficiaryName", id: "patientName", type: "value",    typed: true  },
  { key: "age",             id: "age",         type: "value",    typed: true  },
  { key: "sex",             id: null,          type: "radio",    name: "sex"  },
  { key: "mobile",          id: "mobile",      type: "value",    typed: true  },
  { key: "village",         id: "village",     type: "value",    typed: true  },
  { key: "visitDate",       id: "visitDate",   type: "value",    typed: false },
  { key: "vaccine",         id: "vaccine",     type: "value",    typed: false },
  { key: "dose",            id: "dose",        type: "value",    typed: false },
  // Adverse reaction is now an explicit Yes/No radio (see HTML), so a blank
  // means "never answered", distinct from an answered "No".
  { key: "adverseReaction", id: null,          type: "radio",    name: "adverse" },
];

// ============================================================
// 1. STORAGE SETUP
// ============================================================
localforage.config({ name: "competency-app", storeName: "assessments" });

// ============================================================
// 2. ELEMENT REFERENCES
// ============================================================
const metaScreen        = document.getElementById("metaScreen");
const respondentInput   = document.getElementById("respondentId");
const respondentConfirm = document.getElementById("respondentIdConfirm");
const startBtn          = document.getElementById("startBtn");
const countEl           = document.getElementById("count");
const exportBtn         = document.getElementById("exportBtn");
const clearBtn          = document.getElementById("clearBtn");
const metaStatus        = document.getElementById("metaStatus");

const formScreen        = document.getElementById("formScreen");
const activeRespondent  = document.getElementById("activeRespondent");
const submitBtn         = document.getElementById("submitBtn");
const formStatus        = document.getElementById("formStatus");

const menuBtn      = document.getElementById("menuBtn");
const menuPane     = document.getElementById("menuPane");
const menuBackdrop = document.getElementById("menuBackdrop");
const resumeBtn    = document.getElementById("resumeBtn");
const endBtn       = document.getElementById("endBtn");
const discardBtn   = document.getElementById("discardBtn");

// ============================================================
// 3. SESSION STATE
// ============================================================
let currentSession = null;

// ============================================================
// 4. THE ACTIVE-TIME CLOCK (pause-aware)
// ============================================================
// Everything time-related reads activeElapsedMs(), which returns ms since
// form-open MINUS any paused spans. Implemented by tracking a start time
// and accumulating paused durations.
let clockStart = 0;        // Date.now() at form-open
let pausedAccumMs = 0;     // total paused time banked so far
let pauseStartedAt = null; // Date.now() when the current pause began, or null

function startClock() {
  clockStart = Date.now();
  pausedAccumMs = 0;
  pauseStartedAt = null;
}

function pauseClock() {
  if (pauseStartedAt === null) pauseStartedAt = Date.now();
}

function resumeClock() {
  if (pauseStartedAt !== null) {
    pausedAccumMs += Date.now() - pauseStartedAt;
    pauseStartedAt = null;
  }
}

// Active ms since form-open, excluding paused time. If called while paused,
// it counts up to the moment the pause began.
function activeElapsedMs() {
  const now = (pauseStartedAt !== null) ? pauseStartedAt : Date.now();
  return now - clockStart - pausedAccumMs;
}

// ============================================================
// 5. TELEMETRY STATE
// ============================================================
// Per field: when it was first answered (offset), whether it changed after,
// its last seen value (to detect real changes), and — for typed fields —
// accumulated focus time plus the open-focus start.
let tel = {};
let paused = false;

function initTelemetry() {
  tel = {};
  FORM_FIELDS.forEach((f) => {
    tel[f.key] = {
      responseAtMs: null,   // set once, on first non-empty response
      changedAfter: false,  // true if value changed after first response
      lastValue: "",        // last observed value, to detect changes
      activeMs: 0,          // typed fields only
      focusStart: null,     // typed fields only
    };
  });
}

// Record a field's current value; sets responseAtMs on first real answer
// and flags changedAfter on subsequent changes.
function noteFieldValue(key, value) {
  const t = tel[key];
  const v = (value === null || value === undefined) ? "" : String(value);

  // Ignore no-op events where the value didn't actually change.
  if (v === t.lastValue) return;

  const isFirstRealAnswer = (t.responseAtMs === null && v !== "");
  if (isFirstRealAnswer) {
    t.responseAtMs = activeElapsedMs();      // offset from form-open
  } else if (t.responseAtMs !== null) {
    // Already had a response; this is a later change.
    t.changedAfter = true;
  }
  t.lastValue = v;
}

// ---- focus timing for typed fields only ----
function wireTypedFocus(el, key) {
  if (!el) return;
  el.addEventListener("focus", () => {
    if (paused) return;
    tel[key].focusStart = Date.now();
  });
  el.addEventListener("blur", () => {
    const t = tel[key];
    if (t.focusStart !== null) {
      t.activeMs += Date.now() - t.focusStart;
      t.focusStart = null;
    }
  });
}

function flushTypedFocus() {
  FORM_FIELDS.forEach((f) => {
    const t = tel[f.key];
    if (t.focusStart !== null) {
      t.activeMs += Date.now() - t.focusStart;
      t.focusStart = null;
    }
  });
}

// Wire value-change + focus listeners to every field, once, at load.
function attachAllListeners() {
  FORM_FIELDS.forEach((f) => {
    if (f.type === "radio") {
      document.querySelectorAll('input[name="' + f.name + '"]').forEach((el) => {
        el.addEventListener("change", () => noteFieldValue(f.key, el.value));
      });
    } else {
      const el = document.getElementById(f.id);
      if (!el) return;
      // "input" catches typing/selection as it happens; "change" catches
      // commit events (e.g. date/select). Both funnel to noteFieldValue.
      el.addEventListener("input",  () => noteFieldValue(f.key, readRaw(f, el)));
      el.addEventListener("change", () => noteFieldValue(f.key, readRaw(f, el)));
      if (f.typed) wireTypedFocus(el, f.key);
    }
  });
}

// ============================================================
// 6. READING FIELD VALUES
// ============================================================
function readRaw(f, el) {
  if (f.type === "checkbox") return el.checked ? "Yes" : "No";
  return el.value;
}

function readField(f) {
  if (f.type === "radio") {
    const checked = document.querySelector('input[name="' + f.name + '"]:checked');
    return checked ? checked.value : "";
  }
  const el = document.getElementById(f.id);
  if (!el) return "";
  return readRaw(f, el);
}

function clearFormInputs() {
  FORM_FIELDS.forEach((f) => {
    if (f.type === "radio") {
      document.querySelectorAll('input[name="' + f.name + '"]').forEach((el) => { el.checked = false; });
    } else {
      const el = document.getElementById(f.id);
      if (!el) return;
      if (f.type === "checkbox") el.checked = false;
      else el.value = "";
    }
  });
}

// ============================================================
// 7. SCREEN SWITCHING
// ============================================================
function showMeta() {
  formScreen.classList.add("hidden");
  metaScreen.classList.remove("hidden");
}
function showForm() {
  metaScreen.classList.add("hidden");
  formScreen.classList.remove("hidden");
}

// ============================================================
// 8. START AN ASSESSMENT (meta -> form)
// ============================================================
startBtn.addEventListener("click", () => {
  const id = respondentInput.value.trim();
  const idConfirm = respondentConfirm.value.trim();

  if (id === "") { showMetaStatus("Enter a respondent ID first.", true); return; }
  if (id !== idConfirm) { showMetaStatus("The two IDs do not match. Please re-check.", true); return; }

  currentSession = { respondentId: id };

  initTelemetry();
  clearFormInputs();
  paused = false;
  startClock();                 // begin the active-time clock
  activeRespondent.textContent = id;
  showForm();
});

// ============================================================
// 9. HAMBURGER MENU = interviewer controls + pause
// ============================================================
function openMenu() {
  flushTypedFocus();   // bank any open focus time before pausing
  pauseClock();        // stop the active-time clock
  paused = true;
  menuPane.classList.remove("hidden");
  menuBackdrop.classList.remove("hidden");
}
function closeMenu() {
  menuPane.classList.add("hidden");
  menuBackdrop.classList.add("hidden");
  paused = false;
  resumeClock();       // restart the active-time clock
}

menuBtn.addEventListener("click", openMenu);
menuBackdrop.addEventListener("click", closeMenu);
resumeBtn.addEventListener("click", closeMenu);

// ============================================================
// 10. END ASSESSMENT & SAVE
// ============================================================
endBtn.addEventListener("click", async () => {
  if (!currentSession) return;
  flushTypedFocus();

  const totalTimeMs = activeElapsedMs();  // pause-excluded total

  const record = {
    id: Date.now(),
    respondentId: currentSession.respondentId,
    totalTimeMs: totalTimeMs,
  };

  // Field values.
  FORM_FIELDS.forEach((f) => { record[f.key] = readField(f); });

  // Telemetry columns.
  FORM_FIELDS.forEach((f) => {
    const t = tel[f.key];
    // responseAtMs: blank (NA) if never answered.
    record[f.key + "_responseAtMs"] = (t.responseAtMs === null) ? "" : t.responseAtMs;
    record[f.key + "_changedAfter"] = t.changedAfter ? "YES" : "";
    // activeMs for typed fields only.
    if (f.typed) record[f.key + "_activeMs"] = t.activeMs;
  });

  await localforage.setItem(String(record.id), record);

  currentSession = null;
  closeMenu();
  respondentInput.value = "";
  respondentConfirm.value = "";
  showMeta();
  updateCount();
  showMetaStatus("Assessment saved.", false);
});

// ============================================================
// 11. DISCARD ASSESSMENT
// ============================================================
discardBtn.addEventListener("click", () => {
  if (!confirm("Discard this assessment without saving?")) return;
  currentSession = null;
  closeMenu();
  showMeta();
  showMetaStatus("Assessment discarded.", false);
});

// ============================================================
// 12. SUBMIT (form's own button; behaves like End & save)
// ============================================================
submitBtn.addEventListener("click", () => endBtn.click());

// ============================================================
// 13. COUNT
// ============================================================
async function updateCount() {
  const keys = await localforage.keys();
  countEl.textContent = "Saved assessments on this device: " + keys.length;
}

// ============================================================
// 14. EXPORT CSV
// ============================================================
// Columns derived from the union of all record keys, so new fields appear
// automatically. Flags duplicate respondent IDs. Blank cells = NA.
// Filename: competency_YYYY-MM-DD_<n>cases_HHMM.csv
async function exportCsv() {
  const rows = [];
  await localforage.iterate((value) => { rows.push(value); });
  if (rows.length === 0) return 0;

  const idCounts = {};
  rows.forEach((r) => { idCounts[r.respondentId] = (idCounts[r.respondentId] || 0) + 1; });

  const leading = ["id", "respondentId", "duplicateId", "totalTimeMs"];
  const keySet = new Set(leading);
  rows.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
  const headers = Array.from(keySet);

  const csvLines = [headers.join(",")];
  rows.forEach((r) => {
    const enriched = { ...r, duplicateId: idCounts[r.respondentId] > 1 ? "YES" : "" };
    const line = headers.map((h) => {
      const val = (enriched[h] === undefined || enriched[h] === null) ? "" : String(enriched[h]);
      return '"' + val.replace(/"/g, '""') + '"';
    });
    csvLines.push(line.join(","));
  });

  const csv = csvLines.join("\n");
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hhmm = now.toTimeString().slice(0, 5).replace(":", "");
  const filename = "competency_" + date + "_" + rows.length + "cases_" + hhmm + ".csv";

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

exportBtn.addEventListener("click", async () => {
  const n = await exportCsv();
  showMetaStatus(n === 0 ? "Nothing to export yet." : ("Exported " + n + " assessment(s)."), n === 0);
});

// ============================================================
// 15. CLEAR ALL — GUARDED
// ============================================================
clearBtn.addEventListener("click", async () => {
  const keys = await localforage.keys();
  if (keys.length === 0) { showMetaStatus("No data to clear.", true); return; }
  if (!confirm("Clear ALL saved assessments on this device?")) return;

  const entered = prompt("Enter the clear passcode to continue:");
  if (entered === null) return;
  if (entered !== CLEAR_PASSCODE) { showMetaStatus("Wrong passcode. Data NOT cleared.", true); return; }

  const n = await exportCsv();
  const proceed = confirm(
    "A pre-clear backup of " + n + " assessment(s) has been downloaded.\n\n" +
    "Confirm the file downloaded, then press OK to erase the data on this " +
    "device. Press Cancel to keep the data."
  );
  if (!proceed) { showMetaStatus("Clear cancelled. Data kept.", false); return; }

  await localforage.clear();
  updateCount();
  showMetaStatus("All data cleared (backup was exported).", false);
});

// ============================================================
// 16. STATUS + VERSION
// ============================================================
function showMetaStatus(msg, isError) {
  metaStatus.textContent = msg;
  metaStatus.style.color = isError ? "#dc2626" : "#059669";
  setTimeout(() => { metaStatus.textContent = ""; }, 4000);
}

function showVersion() {
  const el = document.getElementById("versionInfo");
  if (!el) return;
  const swActive = ("serviceWorker" in navigator) && navigator.serviceWorker.controller
    ? "offline-ready" : "not yet offline";
  el.textContent = "Version: " + APP_VERSION + "  •  " + swActive;
}

// ============================================================
// 17. SERVICE WORKER (offline)
// ============================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("Service worker registered."))
      .catch((err) => console.log("Service worker failed:", err));
  });
}

// ============================================================
// 18. INIT
// ============================================================
attachAllListeners();
showMeta();
updateCount();
showVersion();
