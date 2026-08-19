/*
  app.js — all application logic.

  Responsibilities:
    1. Configure local storage (localforage / IndexedDB).
    2. Switch between the two screens (meta <-> form).
    3. Validate and carry the respondent ID from the meta screen.
    4. Capture telemetry (currently: time on the name field).
    5. Save each assessment locally, tagged with its respondent ID.
    6. Count, export (CSV, well-named), and clear (guarded) assessments.
    7. Register the service worker that makes the app work offline.

  Will be split into modules (storage.js, telemetry.js, screens.js) once
  large enough that splitting clearly aids navigation. Not yet.

  KEY CONCEPT — telemetry: we record not just the data entered but HOW it
  was entered (timings, edits, errors). The name-field timer is the first
  example of that pattern; future metrics follow the same shape.
*/

// ============================================================
// 0. CONFIG — values you may want to change live here
// ============================================================
// Passcode that guards the destructive "Clear all data" action. This is
// only a speed bump against accidental taps / casual fiddling — it lives
// in the code, so it is NOT real security. Change it to whatever your
// field team should use.
const CLEAR_PASSCODE = "wipe1234";

// ============================================================
// 1. STORAGE SETUP
// ============================================================
localforage.config({ name: "competency-app", storeName: "assessments" });

// ============================================================
// 2. ELEMENT REFERENCES
// ============================================================
// Meta screen
const metaScreen      = document.getElementById("metaScreen");
const respondentInput = document.getElementById("respondentId");
const respondentConfirm = document.getElementById("respondentIdConfirm");
const startBtn        = document.getElementById("startBtn");
const countEl         = document.getElementById("count");
const exportBtn       = document.getElementById("exportBtn");
const clearBtn        = document.getElementById("clearBtn");
const metaStatus      = document.getElementById("metaStatus");

// Form screen
const formScreen      = document.getElementById("formScreen");
const activeRespondent = document.getElementById("activeRespondent");
const nameInput       = document.getElementById("patientName");
const endBtn          = document.getElementById("endBtn");
const cancelBtn       = document.getElementById("cancelBtn");
const formStatus      = document.getElementById("formStatus");

// ============================================================
// 3. SESSION STATE — the assessment currently in progress
// ============================================================
// Holds everything about the in-progress assessment between "Start" and
// "End". Reset to null when no assessment is active.
let currentSession = null;

// ============================================================
// 4. SCREEN SWITCHING
// ============================================================
// Show one screen, hide the other. The .hidden class (in CSS) does the
// actual hiding.
function showMeta() {
  formScreen.classList.add("hidden");
  metaScreen.classList.remove("hidden");
}
function showForm() {
  metaScreen.classList.add("hidden");
  formScreen.classList.remove("hidden");
}

// ============================================================
// 5. START AN ASSESSMENT (meta -> form)
// ============================================================
startBtn.addEventListener("click", () => {
  const id = respondentInput.value.trim();
  const idConfirm = respondentConfirm.value.trim();

  // Validation: ID must be present and both entries must match. A
  // mistyped ID silently breaks reconciliation with the main CAPI
  // survey, so we guard against it here.
  if (id === "") {
    showMetaStatus("Enter a respondent ID first.", true);
    return;
  }
  if (id !== idConfirm) {
    showMetaStatus("The two IDs do not match. Please re-check.", true);
    return;
  }

  // Begin a new session. startedAt marks when the form screen opened.
  currentSession = {
    respondentId: id,
    startedAt: new Date().toISOString(),
    nameFieldTimeMs: null,
  };

  // Reset the telemetry timer for this assessment.
  fieldFocusTime = null;

  // Prepare and show the form screen.
  activeRespondent.textContent = id;
  nameInput.value = "";
  showForm();
  nameInput.focus();
});

// ============================================================
// 6. TELEMETRY — time spent on the name field
// ============================================================
// Same pattern as before, but the computed value is stored on
// currentSession rather than a loose variable.
let fieldFocusTime = null;

nameInput.addEventListener("focus", () => {
  if (fieldFocusTime === null) fieldFocusTime = Date.now();
});
nameInput.addEventListener("blur", () => {
  if (fieldFocusTime !== null && currentSession) {
    currentSession.nameFieldTimeMs = Date.now() - fieldFocusTime;
  }
});

// ============================================================
// 7. END ASSESSMENT & SAVE (form -> meta)
// ============================================================
endBtn.addEventListener("click", async () => {
  if (!currentSession) return;

  // If the user never left the field, compute its time now.
  if (fieldFocusTime !== null && currentSession.nameFieldTimeMs === null) {
    currentSession.nameFieldTimeMs = Date.now() - fieldFocusTime;
  }

  // Build the record to store. It carries the respondent ID plus session
  // timing and the entered data + metrics.
  const record = {
    id: Date.now(),                          // unique local key
    respondentId: currentSession.respondentId,
    startedAt: currentSession.startedAt,
    savedAt: new Date().toISOString(),
    patientName: nameInput.value,
    nameFieldTimeMs: currentSession.nameFieldTimeMs,
  };

  await localforage.setItem(String(record.id), record);

  // Clear session and go back to the meta screen, ready for the next one.
  currentSession = null;
  fieldFocusTime = null;
  respondentInput.value = "";
  respondentConfirm.value = "";
  showMeta();
  updateCount();
  showMetaStatus("Assessment saved.", false);
});

// ============================================================
// 8. CANCEL ASSESSMENT (discard, form -> meta)
// ============================================================
// For when an assessment is started in error. Discards without saving.
cancelBtn.addEventListener("click", () => {
  if (!confirm("Discard this assessment without saving?")) return;
  currentSession = null;
  fieldFocusTime = null;
  showMeta();
  showMetaStatus("Assessment discarded.", false);
});

// ============================================================
// 9. COUNT STORED ASSESSMENTS
// ============================================================
async function updateCount() {
  const keys = await localforage.keys();
  countEl.textContent = "Saved assessments on this device: " + keys.length;
}

// ============================================================
// 10. EXPORT ALL ASSESSMENTS AS CSV
// ============================================================
// Returns the number of records exported (used by the clear flow too).
// Filename format: competency_YYYY-MM-DD_<n>cases_HHMM.csv
async function exportCsv() {
  const rows = [];
  await localforage.iterate((value) => { rows.push(value); });

  if (rows.length === 0) return 0;

  // Flag duplicate respondent IDs so they can be caught in analysis.
  const idCounts = {};
  for (const r of rows) {
    idCounts[r.respondentId] = (idCounts[r.respondentId] || 0) + 1;
  }

  const headers = [
    "id", "respondentId", "duplicateId",
    "startedAt", "savedAt", "patientName", "nameFieldTimeMs",
  ];
  const csvLines = [headers.join(",")];

  for (const r of rows) {
    const enriched = {
      ...r,
      duplicateId: idCounts[r.respondentId] > 1 ? "YES" : "",
    };
    const line = headers.map((h) => {
      const val = (enriched[h] === undefined || enriched[h] === null)
        ? "" : String(enriched[h]);
      return '"' + val.replace(/"/g, '""') + '"';
    });
    csvLines.push(line.join(","));
  }

  const csv = csvLines.join("\n");

  // Build a descriptive filename: date, case count, and time so repeat
  // exports on the same day don't overwrite each other.
  const now = new Date();
  const date = now.toISOString().slice(0, 10);        // YYYY-MM-DD
  const hhmm = now.toTimeString().slice(0, 5).replace(":", ""); // HHMM
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
  if (n === 0) {
    showMetaStatus("Nothing to export yet.", true);
  } else {
    showMetaStatus("Exported " + n + " assessment(s).", false);
  }
});

// ============================================================
// 11. CLEAR ALL — GUARDED (passcode + forced pre-clear export)
// ============================================================
// Safety sequence:
//   1. Confirm intent.
//   2. Require the passcode (blocks accidental / casual wipes).
//   3. Force a fresh "pre-clear" CSV export BEFORE deleting anything, so
//      the data is always saved to a file first.
//   4. Only then wipe local storage.
clearBtn.addEventListener("click", async () => {
  const keys = await localforage.keys();
  if (keys.length === 0) {
    showMetaStatus("No data to clear.", true);
    return;
  }

  if (!confirm("Clear ALL saved assessments on this device?")) return;

  const entered = prompt("Enter the clear passcode to continue:");
  if (entered === null) return;                 // cancelled
  if (entered !== CLEAR_PASSCODE) {
    showMetaStatus("Wrong passcode. Data NOT cleared.", true);
    return;
  }

  // Force a pre-clear backup export before wiping.
  const n = await exportCsv();
  const proceed = confirm(
    "A pre-clear backup of " + n + " assessment(s) has been downloaded.\n\n" +
    "Confirm the file downloaded correctly, then press OK to erase the " +
    "data on this device. Press Cancel to keep the data."
  );
  if (!proceed) {
    showMetaStatus("Clear cancelled. Data kept.", false);
    return;
  }

  await localforage.clear();
  updateCount();
  showMetaStatus("All data cleared (backup was exported).", false);
});

// ============================================================
// 12. STATUS MESSAGE HELPERS
// ============================================================
// isError=true tints the message red; otherwise green. Clears after 4s.
function showMetaStatus(msg, isError) {
  metaStatus.textContent = msg;
  metaStatus.style.color = isError ? "#dc2626" : "#059669";
  setTimeout(() => { metaStatus.textContent = ""; }, 4000);
}
function showFormStatus(msg) {
  formStatus.textContent = msg;
  setTimeout(() => { formStatus.textContent = ""; }, 4000);
}

// ============================================================
// 13. SERVICE WORKER REGISTRATION (offline support)
// ============================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("Service worker registered."))
      .catch((err) => console.log("Service worker failed:", err));
  });
}

// ============================================================
// 14. INITIALISE
// ============================================================
showMeta();
updateCount();
