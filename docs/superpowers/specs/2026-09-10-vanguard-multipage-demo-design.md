# Vanguard Multi-Page Demo — Approved Design

Extend the existing static Vanguard FakeBTS Tracking PWA into a session-only
demo portal. Preserve the existing Leaflet/OSM road-following simulation,
matched/unmatched handling, distance, confidence, GPS mode, and PWA behavior.

## Flow

1. Login: demo credentials `vanguard` / `demo1234`; incorrect credentials show
   an inline error. Store only an authenticated flag in `sessionStorage`.
2. Home: feature cards for Dashboard and Tracking FakeBTS; Logout returns to
   Login.
3. Dashboard: Thailand map, total 17, and BKK 10, NR 5, ER 2, NER 0, SR 0,
   CR 0.
4. Region selection: select one of the six regions.
5. Region result:
   - BKK: Bangkok 10 and enabled Start Tracking.
   - NR: Chiang Mai 3, Chiang Rai 1, Phitsanulok 1; Under Construction.
   - ER: Chonburi 1, Rayong 1; Under Construction.
   - NER, SR, CR: FakeBTS Not Found.
6. Existing Tracking screen: accessible only after BKK selection.

Page 5 Back returns to Page 4. Tracking Back returns to the BKK result. Every
authenticated screen has a bottom Home action returning to Home. Leaving
Tracking by Back, Home, Logout, browser navigation, or lifecycle events pauses
the simulator and stops browser geolocation.

## Export

After Stop or completion, provide local CSV and GeoJSON downloads. Google Drive
uses the device Web Share sheet; when unavailable, download the same GeoJSON
and explain manual upload. Export only synthetic matched target events with
timestamp, status, latitude, longitude, and confidence. Never export user GPS,
GPS accuracy, CELL_NAME, BTS/site coordinates, RSRP, sector azimuth, road
candidates/scores, HMM/Viterbi internal state, or MR records.

## UX, Failure, and Verification

Continue the Vanguard navy/teal/red visual language. Controls are at least
44px, status uses text plus color, headings receive focus after navigation,
and motion honors reduced-motion. OSM attribution remains visible. Map failure
must not remove totals or navigation. Verify login, every navigation route,
total/count consistency, BKK-only tracking, construction/not-found states,
tracking cleanup, CSV/GeoJSON privacy, responsive layout, and PWA cache update.
