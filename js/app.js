/*
  app.js — all application logic. Version v0.04.

  Responsibilities:
    1. Config + local storage (localforage / IndexedDB).
    2. Switch between the two screens (meta <-> form).
    3. Validate + carry the respondent ID from the meta screen.
    4. The form: capture all field values + per-field timing telemetry.
    5. Hamburger menu = interviewer controls + auto-pause of telemetry.
    6. Save each assessment locally, tagged with its respondent ID.
    7. Count, export (well-named CSV), guarded clear.
    8. Version display; service worker registration (offline).

  Will be split into modules once large enough that splitting clearly
  aids navigation. Not yet.

  KEY CONCEPT — telemetry: we record not just the data entered but HOW it
  was entered. Here we time how long the subject spends on each field.
  Pausing (opening the menu) freezes these timers so interruptions aren't
  counted as thinking time.
*/

// ============================================================
// 0. CONFIG — things you may change live here
// ============================================================
// SINGLE SOURCE OF TRUTH for the version. Shown on the meta screen AND
// (mirrored in service-worker.js as APP_VERSION_TAG) used to name the
// offline cache. Keep the two identical. Bump on every deploy of a
// cached file. Scheme: v0.NN for proof-of-concept builds.
const APP_VERSION = "v0.04";

// Speed bump guarding the destructive "Clear all data" action. NOT real
// security (it lives in the code). Change as your field team needs.
const CLEAR_PASSCODE = "wipe1234";

// The form fields we capture. Each entry: the value's key in the record,
// the element id, and how to read it. Adding a field later means adding
// one line here (and one in the HTML) — the save/export use this list.
const FORM_FIELDS = [
  { key: "beneficiaryName", id: "patientName", type: "value" },
  { key: "age",             id: "age",         type: "value" },
  { key: "sex",             id: null,          type: "radio", name: "sex" },
  { key: "mobile",          id: "mobile",      type: "value" },
  { key: "village",         id: "village",     type: "value" },
  { key: "visitDate",       id: "visitDate",   type: "value" },
  { key: "vaccine",         id: "vaccine",     type: "value" },
  { key: "dose",            id: "dose",        type: "value" },
  { key: "adverseReaction", id: "adverse",     type: "checkbox" },
];

// ============================================================
// 1. STORAGE SETUP
// ============================================================
localforage.config({ name: "competency-app", storeName: "assessments" });

// ============================================================
// 2. ELEMENT REFERENCES
// ============================================================
// Meta screen
const metaScreen        = document.getElementById("metaScreen");
const respondentInput   = document.getElementById("respondentId");
const respondentConfirm = document.getElementById("respondentIdConfirm");
const startBtn          = document.getElementById("startBtn");
const countEl           = document.getElementById("count");
const exportBtn         = document.getElementById("exportBtn");
const clearBtn          = document.getElementById("clearBtn");
const metaStatus        = document.getElementById("metaStatus");

// Form screen
const formScreen        = document.getElementById("formScreen");
const activeRespondent  = document.getElementById("activeRespondent");
const submitBtn         = document.getElementById("submitBtn");
const formStatus        = document.getElementById("formStatus");

// Menu (interviewer controls)
const menuBtn      = document.getElementById("menuBtn");
const menuPane     = document.getElementById("menuPane");
const menuBackdrop = document.getElementById("menuBackdrop");
const resumeBtn    = document.getElementById("resumeBtn");
const endBtn       = document.getElementById("endBtn");
const discardBtn   = document.getElementById("discardBtn");

// ============================================================
// 3. SESSION STATE
// ============================================================
let currentSession = null; // the in-progress assessment, or null

// ============================================================
// 4. SCREEN SWITCHING
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
// 5. PER-FIELD TELEMETRY
// ============================================================
// For each form field we record total focused time (ms) and how many
// times it was focused (a rough "revisits"/hesitation signal). Timers
// freeze while the menu is open (paused).
let fieldTimers = {};   // key -> { totalMs, focusCount, focusStart }
let paused = false;

function initTelemetry() {
  fieldTimers = {};
  FORM_FIELDS.forEach((f) => {
    fieldTimers[f.key] = { totalMs: 0, focusCount: 0, focusStart: null };
  });
}

// Wire focus/blur timing onto an element for a given field key.
function wireFieldTiming(el, key) {
  if (!el) return;
  el.addEventListener("focus", () => {
    if (paused) return;
    const t = fieldTimers[key];
    t.focusCount += 1;
    t.focusStart = Date.now();
  });
  el.addEventListener("blur", () => {
    const t = fieldTimers[key];
    if (t.focusStart !== null) {
      t.totalMs += Date.now() - t.focusStart;
      t.focusStart = null;
    }
  });
}

// Attach timing to every field once, at load.
function attachAllFieldTiming() {
  FORM_FIELDS.forEach((f) => {
    if (f.type === "radio") {
      document.querySelectorAll('input[name="' + f.name + '"]')
        .forEach((el) => wireFieldTiming(el, f.key));
    } else {
      wireFieldTiming(document.getElementById(f.id), f.key);
    }
  });
}

// Close any open field timer (e.g. when pausing or submitting).
function flushOpenTimers() {
  Object.values(fieldTimers).forEach((t) => {
    if (t.focusStart !== null) {
      t.totalMs += Date.now() - t.focusStart;
      t.focusStart = null;
    }
  });
}

// ============================================================
// 6. READING FIELD VALUES
// ============================================================
function readField(f) {
  if (f.type === "radio") {
    const checked = document.querySelector('input[name="' + f.name + '"]:checked');
    return checked ? checked.value : "";
  }
  const el = document.getElementById(f.id);
  if (!el) return "";
  if (f.type === "checkbox") return el.checked ? "Yes" : "No";
  return el.value;
}

function clearFormInputs() {
  FORM_FIELDS.forEach((f) => {
    if (f.type === "radio") {
      document.querySelectorAll('input[name="' + f.name + '"]')
        .forEach((el) => { el.checked = false; });
    } else {
      const el = document.getElementById(f.id);
      if (!el) return;
      if (f.type === "checkbox") el.checked = false;
      else el.value = "";
    }
  });
}

// ============================================================
// 7. START AN ASSESSMENT (meta -> form)
// ============================================================
startBtn.addEventListener("click", () => {
  const id = respondentInput.value.trim();
  const idConfirm = respondentConfirm.value.trim();

  if (id === "") {
    showMetaStatus("Enter a respondent ID first.", true);
    return;
  }
  if (id !== idConfirm) {
    showMetaStatus("The two IDs do not match. Please re-check.", true);
    return;
  }

  currentSession = {
    respondentId: id,
    startedAt: new Date().toISOString(),
  };

  initTelemetry();
  paused = false;
  clearFormInputs();
  activeRespondent.textContent = id;
  showForm();
});

// ============================================================
// 8. HAMBURGER MENU = interviewer controls + pause
// ============================================================
function openMenu() {
  // Pause telemetry: flush open timers and stop counting.
  flushOpenTimers();
  paused = true;
  menuPane.classList.remove("hidden");
  menuBackdrop.classList.remove("hidden");
}
function closeMenu() {
  menuPane.classList.add("hidden");
  menuBackdrop.classList.add("hidden");
  paused = false; // resume counting on next focus
}

menuBtn.addEventListener("click", openMenu);
menuBackdrop.addEventListener("click", closeMenu);
resumeBtn.addEventListener("click", closeMenu);

// ============================================================
// 9. END ASSESSMENT & SAVE (from menu)
// ============================================================
endBtn.addEventListener("click", async () => {
  if (!currentSession) return;
  flushOpenTimers();

  // Build the record: ID + timing + all field values + per-field metrics.
  const record = {
    id: Date.now(),
    respondentId: currentSession.respondentId,
    startedAt: currentSession.startedAt,
    savedAt: new Date().toISOString(),
  };

  // Field values.
  FORM_FIELDS.forEach((f) => { record[f.key] = readField(f); });

  // Per-field telemetry (time + focus count), as flat columns.
  FORM_FIELDS.forEach((f) => {
    record[f.key + "_ms"] = fieldTimers[f.key].totalMs;
    record[f.key + "_focusCount"] = fieldTimers[f.key].focusCount;
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
// 10. DISCARD ASSESSMENT (from menu)
// ============================================================
discardBtn.addEventListener("click", () => {
  if (!confirm("Discard this assessment without saving?")) return;
  currentSession = null;
  closeMenu();
  showMeta();
  showMetaStatus("Assessment discarded.", false);
});

// ============================================================
// 11. SUBMIT (the form's own button — looks like the real app)
// ============================================================
// In a real app "Submit" files the record. Here it behaves like End &
// save, so the form feels authentic to the health worker.
submitBtn.addEventListener("click", () => endBtn.click());

// ============================================================
// 12. COUNT STORED ASSESSMENTS
// ============================================================
async function updateCount() {
  const keys = await localforage.keys();
  countEl.textContent = "Saved assessments on this device: " + keys.length;
}

// ============================================================
// 13. EXPORT ALL AS CSV
// ============================================================
// Columns are derived from the union of all record keys, so new fields
// appear automatically. Flags duplicate respondent IDs.
// Filename: competency_YYYY-MM-DD_<n>cases_HHMM.csv
async function exportCsv() {
  const rows = [];
  await localforage.iterate((value) => { rows.push(value); });
  if (rows.length === 0) return 0;

  const idCounts = {};
  rows.forEach((r) => {
    idCounts[r.respondentId] = (idCounts[r.respondentId] || 0) + 1;
  });

  // Build the header from every key seen across all records, keeping a
  // sensible leading order for the core columns.
  const leading = ["id", "respondentId", "duplicateId", "startedAt", "savedAt"];
  const keySet = new Set(leading);
  rows.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
  const headers = Array.from(keySet);

  const csvLines = [headers.join(",")];
  rows.forEach((r) => {
    const enriched = { ...r, duplicateId: idCounts[r.respondentId] > 1 ? "YES" : "" };
    const line = headers.map((h) => {
      const val = (enriched[h] === undefined || enriched[h] === null)
        ? "" : String(enriched[h]);
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
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

exportBtn.addEventListener("click", async () => {
  const n = await exportCsv();
  showMetaStatus(n === 0 ? "Nothing to export yet." : ("Exported " + n + " assessment(s)."), n === 0);
});

// ============================================================
// 14. CLEAR ALL — GUARDED (passcode + forced pre-clear export)
// ============================================================
clearBtn.addEventListener("click", async () => {
  const keys = await localforage.keys();
  if (keys.length === 0) { showMetaStatus("No data to clear.", true); return; }
  if (!confirm("Clear ALL saved assessments on this device?")) return;

  const entered = prompt("Enter the clear passcode to continue:");
  if (entered === null) return;
  if (entered !== CLEAR_PASSCODE) {
    showMetaStatus("Wrong passcode. Data NOT cleared.", true);
    return;
  }

  const n = await exportCsv(); // forced pre-clear backup
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
// 15. STATUS HELPERS
// ============================================================
function showMetaStatus(msg, isError) {
  metaStatus.textContent = msg;
  metaStatus.style.color = isError ? "#dc2626" : "#059669";
  setTimeout(() => { metaStatus.textContent = ""; }, 4000);
}

// ============================================================
// 16. VERSION DISPLAY
// ============================================================
function showVersion() {
  const el = document.getElementById("versionInfo");
  if (!el) return;
  const swActive = ("serviceWorker" in navigator) && navigator.serviceWorker.controller
    ? "offline-ready" : "not yet offline";
  el.textContent = "Version: " + APP_VERSION + "  •  " + swActive;
}

// ============================================================
// 17. SERVICE WORKER REGISTRATION (offline)
// ============================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("Service worker registered."))
      .catch((err) => console.log("Service worker failed:", err));
  });
}

// ============================================================
// 18. INITIALISE
// ============================================================
attachAllFieldTiming();
showMeta();
updateCount();
showVersion();
