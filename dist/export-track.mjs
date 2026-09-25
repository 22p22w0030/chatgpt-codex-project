const EVENT_KEYS = new Set(['timestamp', 'status', 'latitude', 'longitude', 'confidence']);
const CSV_HEADERS = ['timestamp', 'status', 'latitude', 'longitude', 'confidence'];
const GEOJSON_FILENAME = 'vanguard-synthetic-track.geojson';
const GEOJSON_TYPE = 'application/geo+json;charset=utf-8';

const hasOnlyPublicKeys = event => {
  try {
    return Object.getPrototypeOf(event) === Object.prototype &&
      Reflect.ownKeys(event).every(key => typeof key === 'string' && EVENT_KEYS.has(key)) &&
      [...EVENT_KEYS].every(key => Object.hasOwn(event, key));
  } catch {
    return false;
  }
};

const isPublicMatchedEvent = event => (
  event &&
  typeof event === 'object' &&
  hasOnlyPublicKeys(event) &&
  typeof event.timestamp === 'string' &&
  event.timestamp.length > 0 &&
  event.status === 'matched' &&
  Number.isFinite(event.latitude) && event.latitude >= -90 && event.latitude <= 90 &&
  Number.isFinite(event.longitude) && event.longitude >= -180 && event.longitude <= 180 &&
  Number.isFinite(event.confidence) && event.confidence >= 0 && event.confidence <= 1
);

/**
 * Returns new records containing only safe synthetic matched target fields.
 * An event with an unapproved key is discarded rather than partially exported.
 */
export function sanitizeTrack(track) {
  if (!Array.isArray(track)) return [];
  return track.filter(isPublicMatchedEvent).map(event => ({
    timestamp: event.timestamp,
    status: event.status,
    latitude: event.latitude,
    longitude: event.longitude,
    confidence: event.confidence
  }));
}

const escapeCsv = value => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function buildTrackCsv(track) {
  const rows = sanitizeTrack(track).map(event => CSV_HEADERS.map(key => escapeCsv(event[key])).join(','));
  return `\uFEFF${CSV_HEADERS.join(',')}\r\n${rows.length ? `${rows.join('\r\n')}\r\n` : ''}`;
}

export function buildTrackGeoJson(track) {
  const events = sanitizeTrack(track);
  const pointFeatures = events.map(event => ({
    type: 'Feature',
    properties: {
      timestamp: event.timestamp,
      status: event.status,
      confidence: event.confidence
    },
    geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] }
  }));
  const lineFeature = events.length >= 2 ? [{
    type: 'Feature',
    properties: { kind: 'synthetic-target-track' },
    geometry: { type: 'LineString', coordinates: events.map(event => [event.longitude, event.latitude]) }
  }] : [];

  return { type: 'FeatureCollection', features: [...lineFeature, ...pointFeatures] };
}

/** Creates a local, user-initiated download without sending track data anywhere. */
export function downloadTrack({
  content,
  filename,
  type,
  document = globalThis.document,
  URL = globalThis.URL,
  Blob = globalThis.Blob
}) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * Offers the generated GeoJSON to the device share sheet (including Drive when
 * installed). Devices without file sharing receive the same local download.
 */
export async function shareTrackToDrive(track, {
  navigator = globalThis.navigator,
  File: FileCtor = globalThis.File,
  download = downloadTrack
} = {}) {
  const content = JSON.stringify(buildTrackGeoJson(track));
  if (typeof FileCtor === 'function' && typeof navigator?.share === 'function') {
    const file = new FileCtor([content], GEOJSON_FILENAME, { type: GEOJSON_TYPE });
    const shareData = {
      files: [file],
      title: 'Vanguard synthetic track',
      text: 'Synthetic matched target track only.'
    };
    if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })) {
      await navigator.share(shareData);
      return 'shared';
    }
  }

  download({ content, filename: GEOJSON_FILENAME, type: GEOJSON_TYPE });
  return 'downloaded';
}
