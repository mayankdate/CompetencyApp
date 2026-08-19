/*
  app.js — all application logic for the skeleton build.

  Responsibilities right now:
    1. Configure local storage (localforage / IndexedDB).
    2. Capture one example telemetry metric (time spent on the name field).
    3. Save each assessment locally on the device.
    4. Count, export (to CSV), and clear stored assessments.
    5. Register the service worker that makes the app work offline.

  As the project grows this file will be split into focused modules
  (e.g. storage.js, telemetry.js) once it is large enough that splitting
  genuinely aids navigation. Until then, everything lives here, grouped
  into clearly-labelled sections.

  KEY CONCEPT — telemetry:
  The whole point of this app is to measure how health workers interact
  with a digital form. So alongside the *data they enter*, we record
  *how they entered it* (timings, edits, errors). The name-field timer
  below is the first, simplest example of that pattern.
*/

// ============================================================
// 1. STORAGE SETUP
// ============================================================
// localforage wraps IndexedDB in a simple get/set API. This data
// persists across reloads, browser restarts, and reboots, and needs
// no internet. "name" and "storeName" just namespace our database.
localforage.config({ name: "competency-app", storeName: "assessments" });

// ============================================================
// 2. GRAB REFERENCES TO PAGE ELEMENTS
// ============================================================
// We look these up once and reuse them, rather than searching the
// page every time.
const nameInput = document.getElementById("patientName");
const saveBtn   = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn  = document.getElementById("clearBtn");
const countEl   = document.getElementById("count");
const statusEl  = document.getElementById("status");

// ============================================================
// 3. TELEMETRY — example: time spent on the name field
// ============================================================
// We record the moment the user first focuses (taps into) the field,
// and compute elapsed time when they leave it (blur) or when they save.
// This is the template every future per-field metric will follow.
let fieldFocusTime = null; // timestamp (ms) when field was first focused
let fieldTimeMs    = null; // total time spent, computed on blur/save

nameInput.addEventListener("focus", () => {
  // Only record the *first* focus, so re-focusing doesn't reset the clock.
  if (fieldFocusTime === null) fieldFocusTime = Date.now();
});

nameInput.addEventListener("blur", () => {
  if (fieldFocusTime !== null) {
    fieldTimeMs = Date.now() - fieldFocusTime;
  }
});

// ============================================================
// 4. SAVE AN ASSESSMENT
// ============================================================
saveBtn.addEventListener("click", async () => {
  // If the user tapped Save while still in the field (never blurred),
  // compute the elapsed time up to this moment.
  if (fieldFocusTime !== null && fieldTimeMs === null) {
    fieldTimeMs = Date.now() - fieldFocusTime;
  }

  // One assessment = one record object. Every field, entered value, and
  // captured metric becomes a property here. This shape will grow.
  const record = {
    id: Date.now(),                    // unique-enough key (ms timestamp)
    savedAt: new Date().toISOString(), // human-readable save time
    patientName: nameInput.value,      // the data the worker entered
    nameFieldTimeMs: fieldTimeMs,      // the metric we captured
  };

  // Store it. The key is the id as a string; localforage handles the rest.
  await localforage.setItem(String(record.id), record);

  // Reset the form and the timer for the next assessment.
  nameInput.value = "";
  fieldFocusTime = null;
  fieldTimeMs = null;

  showStatus("Saved.");
  updateCount();
});

// ============================================================
// 5. COUNT STORED ASSESSMENTS
// ============================================================
// Reads how many records are in local storage and updates the display.
async function updateCount() {
  const keys = await localforage.keys();
  countEl.textContent = "Saved assessments on this device: " + keys.length;
}

// ============================================================
// 6. EXPORT ALL ASSESSMENTS AS CSV
// ============================================================
// Gathers every stored record, builds a CSV string, and triggers a
// file download. This is the "manual export" data-collection model:
// the interviewer exports and sends the file to the research team.
exportBtn.addEventListener("click", async () => {
  // Collect every record into an array.
  const rows = [];
  await localforage.iterate((value) => { rows.push(value); });

  if (rows.length === 0) {
    showStatus("Nothing to export yet.");
    return;
  }

  // Define the columns. As records gain fields, add them here so they
  // appear in the export. (Later we may generate this list automatically.)
  const headers = ["id", "savedAt", "patientName", "nameFieldTimeMs"];
  const csvLines = [headers.join(",")];

  // Build one CSV line per record.
  for (const r of rows) {
    const line = headers.map((h) => {
      const val = (r[h] === undefined || r[h] === null) ? "" : String(r[h]);
      // Wrap every value in quotes and double any internal quotes, so
      // commas or quotes inside a value don't break the CSV structure.
      return '"' + val.replace(/"/g, '""') + '"';
    });
    csvLines.push(line.join(","));
  }

  const csv = csvLines.join("\n");

  // Turn the string into a downloadable file and click a hidden link.
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assessments-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url); // free the temporary URL

  showStatus("Exported " + rows.length + " assessment(s).");
});

// ============================================================
// 7. CLEAR ALL ASSESSMENTS (with confirmation)
// ============================================================
// Destructive. Used to reset a device between field sessions AFTER the
// data has been safely exported. Guarded by a confirm() dialog.
clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete ALL saved assessments on this device?")) return;
  await localforage.clear();
  updateCount();
  showStatus("All cleared.");
});

// ============================================================
// 8. STATUS MESSAGE HELPER
// ============================================================
// Shows a short message that clears itself after 3 seconds.
function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ""; }, 3000);
}

// ============================================================
// 9. SERVICE WORKER REGISTRATION (offline support)
// ============================================================
// The service worker (service-worker.js, at the project root) caches
// the app's files so it loads with no internet after the first visit.
// It must live at the root so its "scope" covers the whole app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("Service worker registered."))
      .catch((err) => console.log("Service worker failed:", err));
  });
}

// ============================================================
// 10. INITIALISE
// ============================================================
// Show the current saved count as soon as the page loads.
updateCount();
