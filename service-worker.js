/*
  service-worker.js — makes the app work offline.

  MUST stay at the project root. A service worker can only control pages
  at or below its own folder ("scope"), so placing it at the root lets it
  cache and serve the entire app.

  How it works, in three lifecycle events:
    install  — cache all the app's files the first time.
    activate — delete caches from older versions.
    fetch    — serve files from the cache, falling back to the network.

  IMPORTANT — VERSION MUST MATCH app.js:
  The version string below must be kept in step with APP_VERSION in
  js/app.js. app.js shows APP_VERSION on the meta screen; this file uses
  the same version to name the cache. The service worker loads before
  app.js and can't share a variable with it without a build step (which
  this project deliberately avoids), so the two are kept in sync BY HAND.

  Therefore, whenever you change any cached file, update BOTH:
    1. APP_VERSION in js/app.js
    2. APP_VERSION_TAG below
  Keep them identical. (See ARCHITECTURE.md "Versioning".)
*/

// Keep this identical to APP_VERSION in js/app.js.
const APP_VERSION_TAG = "v0.05";

// The cache name is derived from the version tag, so bumping the version
// automatically gives a fresh cache and evicts the old one on activate.
const CACHE_NAME = "competency-app-" + APP_VERSION_TAG;

// Every file the app needs to run offline. Paths are relative to this
// file (the root). Add new CSS/JS files here as the app grows.
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js",
];

// INSTALL: open the cache and store all the app's files.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  // Activate this new worker immediately instead of waiting.
  self.skipWaiting();
});

// ACTIVATE: remove any caches that don't match the current version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  // Take control of open pages right away.
  self.clients.claim();
});

// FETCH: for every network request, try the cache first; if it's not
// there, fall back to the live network.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
