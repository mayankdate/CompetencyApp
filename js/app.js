// ---- Storage setup -------------------------------------------------
// localforage stores data in IndexedDB, which survives reboots and works offline.
localforage.config({ name: "health-mock", storeName: "assessments" });

const nameInput = document.getElementById("patientName");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");

// ---- One simple telemetry example ---------------------------------
// Record when the user first focuses the field and when they finish,
// so we can compute "time spent on the name field" in milliseconds.
let fieldFocusTime = null;
let fieldTimeMs = null;

nameInput.addEventListener("focus", () => {
  if (fieldFocusTime === null) fieldFocusTime = Date.now();
});
nameInput.addEventListener("blur", () => {
  if (fieldFocusTime !== null) {
    fieldTimeMs = Date.now() - fieldFocusTime;
  }
});

// ---- Save an assessment -------------------------------------------
saveBtn.addEventListener("click", async () => {
  // If they never blurred the field, compute time up to now.
  if (fieldFocusTime !== null && fieldTimeMs === null) {
    fieldTimeMs = Date.now() - fieldFocusTime;
  }

  const record = {
    id: Date.now(),                          // unique-enough key
    savedAt: new Date().toISOString(),
    patientName: nameInput.value,
    nameFieldTimeMs: fieldTimeMs,            // our first real metric
  };

  await localforage.setItem(String(record.id), record);

  // Reset for the next assessment
  nameInput.value = "";
  fieldFocusTime = null;
  fieldTimeMs = null;

  showStatus("Saved.");
  updateCount();
});

// ---- Count how many are stored ------------------------------------
async function updateCount() {
  const keys = await localforage.keys();
  countEl.textContent = "Saved assessments on this device: " + keys.length;
}

// ---- Export everything as CSV -------------------------------------
exportBtn.addEventListener("click", async () => {
  const rows = [];
  await localforage.iterate((value) => { rows.push(value); });

  if (rows.length === 0) {
    showStatus("Nothing to export yet.");
    return;
  }

  const headers = ["id", "savedAt", "patientName", "nameFieldTimeMs"];
  const csvLines = [headers.join(",")];

  for (const r of rows) {
    const line = headers.map((h) => {
      const val = r[h] === undefined || r[h] === null ? "" : String(r[h]);
      // Wrap in quotes and escape any internal quotes, so commas are safe.
      return '"' + val.replace(/"/g, '""') + '"';
    });
    csvLines.push(line.join(","));
  }

  const csv = csvLines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assessments-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);

  showStatus("Exported " + rows.length + " assessment(s).");
});

// ---- Clear all (with confirmation) --------------------------------
clearBtn.addEventListener("click", async () => {
  if (!confirm("Delete ALL saved assessments on this device?")) return;
  await localforage.clear();
  updateCount();
  showStatus("All cleared.");
});

function showStatus(msg) {
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = ""; }, 3000);
}

// ---- Register the service worker (offline support) ----------------
// Note: service-worker.js lives at the project root so it can cache
// the whole app. Its path here is relative to index.html (also root).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js")
      .then(() => console.log("Service worker registered."))
      .catch((err) => console.log("Service worker failed:", err));
  });
}

// ---- Init ----------------------------------------------------------
updateCount();
