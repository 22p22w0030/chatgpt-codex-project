# Vanguard Mobile Demo
Static PWA. Serve dist over HTTPS for device location and installation. End-user demo uses simulated target/follower positions along a bundled OSRM driving route; it does not run HMM/Viterbi or provide validated road matching. Open app and press Start. GPS mode shows real device location in local memory and removes external basemap tiles. Simulation mode uses OpenStreetMap public tiles in a fixed demonstration area; road geometry is the full OSRM driving response (77 vertices, approximately 3.15 km), attributed to OSM contributors under ODbL; no live device positions are sent to OSRM. Target and device observations are not uploaded or persisted. Background tracking is not supported. GPS access requires the browser and embedding context to grant location permission.

Run tests: `node --test tests/*.test.mjs`.

The demo advances 1 metre every 100 ms (nominal 36 km/h). roadSlice preserves all intervening road vertices in the rendered trail; unmatched gaps remain disconnected. OSRM routing chooses road direction using its driving profile; this is a demonstration route, not a live HMM match. Cached route geometry remains available without routing-service access. Source: https://project-osrm.org/docs/v5.24.0/api/#route-service .

Feed adapter: replace makeFeed() from dist/domain.mjs with an object exposing start(onEvent,onComplete), pause(), reset(), completed. Input events permit only timestamp, status (matched/low_confidence/unmatched), latitude, longitude, confidence. This release has no external live-feed connection. Validate events with validate(), and use reduce() to preserve trusted points and break trails across missing observations.

PWA shell and bundled Leaflet cache locally after initial online use; OSM tiles are not cached by the service worker. Leaflet 1.9.4 © Vladimir Agafonkin, BSD-2-Clause, license embedded in leaflet.js. OSM data attribution remains on online maps.
