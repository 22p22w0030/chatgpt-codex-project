# Vanguard Multi-Page Demo Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task. Steps use checkbox syntax.

**Goal:** Build the approved five-page demo portal before the existing Vanguard Tracking screen.

**Architecture:** Keep the static HTML/CSS/ES-module/Leaflet PWA. Add pure demo-domain and export modules plus a browser portal controller; reuse the existing tracking and road modules.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Leaflet, History API, sessionStorage, Geolocation, Web Share, Service Worker, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-vanguard-multipage-demo-design.md`

## Global Constraints

- Exact credentials and counts come from the approved spec.
- Only BKK enters Tracking; NR/ER are Under Construction; NER/SR/CR are Not Found.
- Every authenticated screen has Home; Page 5 Back→Page 4; Tracking Back→Page 5.
- Leaving Tracking stops simulation and GPS.
- Export matched synthetic target events only and reject additional/private keys.
- Preserve existing tracking behavior, visible OSM attribution, accessibility, and PWA installation.
- No analytics, trackers, production credentials, real radio data, or Google OAuth.

### Task 1: Demo Domain

**Files:** Create `package.json`, `dist/portal-domain.mjs`, `tests/portal-domain.test.mjs`.

**Interfaces:** Export `REGIONS`, `DEMO_USERNAME`, `authenticateDemo`, `dashboardTotal`, `getRegion`, `rankProvinces`, `regionOutcome`, and `resolveView`. Outcomes are `tracking`, `under_construction`, and `not_found`; views are `login`, `home`, `dashboard`, `regions`, `result`, and `tracking`.

- [ ] Write tests for exact credentials/counts/total/province sums, sorted rankings and exact filter, outcome rules, unknown regions, unauthenticated redirects, and BKK-only Tracking.
- [ ] Run `node --test tests/*.test.mjs` and confirm failure because the module is missing.
- [ ] Implement frozen demo records and pure functions from the approved spec.
- [ ] Run all tests and `git diff --check`; commit `feat: add Vanguard demo portal domain`.

### Task 2: Multi-View Shell

**Files:** Modify `dist/index.html`, `dist/style.css`; create `tests/static-assets.test.mjs`.

**Interfaces:** Create `data-view` sections for all six views and IDs `login-form`, `login-error`, `dashboard-map`, `dashboard-total`, `region-list`, `province-filter`, `province-ranking`, `result-state`, `open-tracking`, `tracking-stop`, `export-panel`, `save-local`, `save-local-csv`, `save-local-geojson`, `save-drive`, `nav-back`, `nav-home`, `nav-logout`. Preserve all existing tracking IDs.

- [ ] Write static tests for all views/IDs, unique IDs, Login-only initial visibility, focusable headings, 44px targets, reduced motion, and local export group structure.
- [ ] Confirm tests fail on the old single screen.
- [ ] Build the responsive Vanguard shell; reserve at least 128px bottom space for two-row narrow navigation and keep desktop map/attribution above fixed navigation.
- [ ] Run all tests and the forbidden-radio-field scan; commit `feat: add Vanguard multi-page portal shell`.

### Task 3: Portal Controller and Dashboard

**Files:** Create `dist/portal-controller.mjs`; modify `dist/index.html`, `tests/static-assets.test.mjs`.

**Interfaces:** Export `createPortalController({document, window, leaflet, onEnterTracking, onLeaveTracking})` returning `start`, `navigate`, `currentView`, `selectedRegion`, `destroy`. Store only `vanguard.demo.auth` and `vanguard.demo.region` in sessionStorage.

- [ ] Write source-contract tests for session-only auth, lifecycle callbacks, and no localStorage.
- [ ] Confirm failure while controller is missing.
- [ ] Implement login, route resolution, history/back/home/logout, heading focus, dashboard/region/result rendering, province filtering, BKK gate, lazy Thailand Leaflet markers, attribution, and map-only fallback.
- [ ] Run all tests, syntax, privacy, and diff checks; commit `feat: connect portal navigation and dashboard`.

### Task 4: Tracking Integration and Cleanup

**Files:** Modify `dist/app.js`, `dist/index.html`, `tests/static-assets.test.mjs`.

**Interfaces:** Instantiate portal controller with `onEnterTracking: enterTracking` and `onLeaveTracking: leaveTracking`. Maintain `syntheticTrack` containing only matched event keys `timestamp`, `status`, `latitude`, `longitude`, `confidence`.

- [ ] Write failing source-contract tests for controller instantiation, lifecycle callbacks, Stop, GPS cleanup, and matched-only collection.
- [ ] Preserve road simulation; initialize map once and invalidate size on Tracking entry.
- [ ] Implement explicit Stop and cleanup before all transitions/page lifecycle events; reveal export only after stopped/completed with at least one matched point.
- [ ] Run all tests and privacy checks; commit `feat: gate and manage BKK tracking session`.

### Task 5: Privacy-Safe Export

**Files:** Create `dist/export-track.mjs`, `tests/export-track.test.mjs`; modify `dist/app.js`, `dist/index.html`.

**Interfaces:** Export `sanitizeTrack`, `buildTrackCsv`, `buildTrackGeoJson`, `downloadTrack`, `shareTrackToDrive`. Reject any key outside the five-event-key allowlist and remove unmatched events. GeoJSON coordinates are longitude,latitude.

- [ ] Write failing tests for matched-only CSV/GeoJSON, RFC4180 CSV, line/point geometry, and rejection of user GPS/accuracy/radio/candidate fields.
- [ ] Implement UTF-8 BOM CSV, GeoJSON, Blob downloads, Web Share, and download fallback.
- [ ] Wire CSV, GeoJSON, and Drive buttons with aria-live results and no console coordinate logging.
- [ ] Run all tests/privacy checks; commit `feat: add privacy-safe demo track export`.

### Task 6: PWA and Final Verification

**Files:** Modify `dist/sw.js`, `dist/manifest.webmanifest`, `tests/static-assets.test.mjs` and only defect-proven earlier files.

**Interfaces:** New cache version includes portal-domain, portal-controller, and export-track; OSM tiles remain network-only.

- [ ] Add failing manifest/cache assertions.
- [ ] Update portal name/start URL and application-shell cache, deleting older caches on activation.
- [ ] Run complete tests, syntax checks, diff check, privacy scan, and browser flow checks at mobile and desktop sizes.
- [ ] Commit `feat: complete Vanguard multi-page demo`.
- [ ] Push exact source commit and save a new existing-Site version without deploying; request explicit live deployment authorization.
