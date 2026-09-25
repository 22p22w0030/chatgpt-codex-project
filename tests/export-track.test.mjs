import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeTrack,
  buildTrackCsv,
  buildTrackGeoJson,
  downloadTrack,
  shareTrackToDrive
} from '../dist/export-track.mjs';

const matched = (overrides = {}) => ({
  timestamp: '2026-09-10T12:00:00Z',
  status: 'matched',
  latitude: 13.7563,
  longitude: 100.5018,
  confidence: 0.91,
  ...overrides
});

test('sanitizes to matched synthetic target events and rejects private or unexpected keys', () => {
  const source = [
    matched(),
    matched({ status: 'unmatched' }),
    matched({ accuracy: 3 }),
    matched({ userGps: { latitude: 51.5, longitude: -0.1 } }),
    matched({ CELL_NAME: 'private-cell' }),
    matched({ RSRP: -92 }),
    matched({ candidates: [{ score: 1 }] })
  ];

  assert.deepEqual(sanitizeTrack(source), [matched()]);
});

test('rejects prototyped records so inherited private fields cannot cross the export boundary', () => {
  const inheritedPrivateRecord = Object.create({
    timestamp: '2026-09-10T12:00:00Z',
    status: 'matched',
    latitude: 13.7563,
    longitude: 100.5018,
    confidence: 0.91,
    accuracy: 3,
    RSRP: -92
  });

  assert.deepEqual(sanitizeTrack([inheritedPrivateRecord, matched()]), [matched()]);
});

test('builds a UTF-8 BOM RFC4180 CSV from only sanitized matched events', () => {
  const csv = buildTrackCsv([
    matched({ timestamp: '2026-09-10T12:00:00Z, "quoted"' }),
    matched({ latitude: 13.8, longitude: 100.6, confidence: 0.5, cell_name: 'do-not-export' }),
    matched({ status: 'low_confidence' })
  ]);

  assert.equal(
    csv,
    '\uFEFFtimestamp,status,latitude,longitude,confidence\r\n"2026-09-10T12:00:00Z, ""quoted""",matched,13.7563,100.5018,0.91\r\n'
  );
});

test('builds GeoJSON point features and a longitude-latitude line for matched synthetic events', () => {
  const geoJson = buildTrackGeoJson([
    matched(),
    matched({ timestamp: '2026-09-10T12:01:00Z', latitude: 13.757, longitude: 100.502, confidence: 0.92 }),
    matched({ status: 'unmatched', latitude: 51.5, longitude: -0.1 })
  ]);

  assert.equal(geoJson.type, 'FeatureCollection');
  assert.deepEqual(geoJson.features[0], {
    type: 'Feature',
    properties: { kind: 'synthetic-target-track' },
    geometry: { type: 'LineString', coordinates: [[100.5018, 13.7563], [100.502, 13.757]] }
  });
  assert.deepEqual(geoJson.features.slice(1).map(feature => feature.geometry), [
    { type: 'Point', coordinates: [100.5018, 13.7563] },
    { type: 'Point', coordinates: [100.502, 13.757] }
  ]);
  assert.deepEqual(geoJson.features[1].properties, {
    timestamp: '2026-09-10T12:00:00Z', status: 'matched', confidence: 0.91
  });
});

test('downloads serialized content with a Blob and revokes its temporary URL', () => {
  const calls = [];
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.type = options.type; }
  }
  const document = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { calls.push('click'); } };
    }
  };
  const URL = {
    createObjectURL(blob) { calls.push(blob); return 'blob:demo'; },
    revokeObjectURL(url) { calls.push(`revoke:${url}`); }
  };

  assert.equal(downloadTrack({ content: 'demo', filename: 'track.csv', type: 'text/csv', document, URL, Blob: FakeBlob }), 'track.csv');
  assert.equal(calls[0].parts[0], 'demo');
  assert.equal(calls[0].type, 'text/csv');
  assert.deepEqual(calls.slice(1), ['click', 'revoke:blob:demo']);
});

test('shares GeoJSON through Web Share and downloads it when sharing is unavailable', async () => {
  const shared = [];
  class FakeFile {
    constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; }
  }
  const webShareNavigator = {
    canShare({ files }) { return files[0] instanceof FakeFile; },
    async share(payload) { shared.push(payload); }
  };

  assert.equal(await shareTrackToDrive([matched()], { navigator: webShareNavigator, File: FakeFile }), 'shared');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].name, 'vanguard-synthetic-track.geojson');

  const downloaded = [];
  assert.equal(await shareTrackToDrive([matched()], {
    navigator: {},
    download: options => downloaded.push(options) || options.filename
  }), 'downloaded');
  assert.equal(downloaded[0].filename, 'vanguard-synthetic-track.geojson');
  assert.equal(downloaded[0].type, 'application/geo+json;charset=utf-8');
});
