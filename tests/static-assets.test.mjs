import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('style.css', root), 'utf8');
const app = await readFile(new URL('app.js', root), 'utf8');
const portalController = await readFile(new URL('portal-controller.mjs', root), 'utf8');
const serviceWorker = await readFile(new URL('sw.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));

const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] ?? match?.[2] ?? match?.[3];
};

const startTagById = id => {
  const tag = html.match(new RegExp(`<[^>]+\\sid=(?:"${id}"|'${id}')[^>]*>`, 'i'))?.[0];
  assert.ok(tag, `missing #${id}`);
  return tag;
};

const viewMarkup = name => {
  const match = html.match(new RegExp(`<section\\b(?=[^>]*\\sdata-view=(?:"${name}"|'${name}'))[^>]*>[\\s\\S]*?<\\/section>`, 'i'));
  assert.ok(match, `missing ${name} view`);
  return match[0];
};

const functionDeclaration = name => {
  const signature = new RegExp(`function\\s+${name}\\s*\\(`).exec(app);
  assert.ok(signature, `missing ${name}`);
  const openingBrace = app.indexOf('{', signature.index);
  let depth = 0;
  for (let index = openingBrace; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    if (app[index] === '}') depth -= 1;
    if (depth === 0) return app.slice(signature.index, index + 1);
  }
  assert.fail(`unterminated ${name}`);
};

test('ships one uniquely identified element for every portal and tracking contract', () => {
  const ids = [...html.matchAll(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)].map(match => match[1] ?? match[2] ?? match[3]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  assert.deepEqual(duplicates, [], `duplicate IDs: ${duplicates.join(', ')}`);

  const portalIds = [
    'login-form', 'login-error', 'dashboard-map', 'dashboard-total', 'dashboard-region-summary', 'region-list',
    'province-filter', 'province-ranking', 'result-state', 'open-tracking',
    'tracking-stop', 'export-panel', 'save-local', 'save-local-csv',
    'save-local-geojson', 'save-drive', 'nav-back', 'nav-home', 'nav-logout'
  ];
  const trackingIds = [
    'help', 'demo', 'gps', 'map', 'maplabel', 'follow', 'me', 'fit', 'youlabel',
    'status', 'distance', 'confidence', 'updated', 'notice', 'start', 'reset',
    'gpsstate', 'install', 'dialog', 'close'
  ];
  for (const id of [...portalIds, ...trackingIds]) assert.equal(ids.filter(value => value === id).length, 1, `expected one #${id}`);
});

test('defines all six views with only Login initially visible', () => {
  const views = ['login', 'home', 'dashboard', 'regions', 'result', 'tracking'];
  for (const name of views) {
    const section = viewMarkup(name);
    const start = section.slice(0, section.indexOf('>') + 1);
    assert.equal(/\shidden(?:\s|=|>)/i.test(start), name !== 'login', `${name} initial visibility`);
  }
  assert.match(html, /<nav\b[^>]*class="portal-nav"[^>]*\shidden(?:\s|=|>)/i, 'authenticated navigation starts hidden');
});

test('each view has a programmatically focusable primary heading', () => {
  for (const name of ['login', 'home', 'dashboard', 'regions', 'result', 'tracking']) {
    const heading = viewMarkup(name).match(/<h1\b[^>]*>/i)?.[0];
    assert.ok(heading, `${name} view needs an h1`);
    assert.equal(attribute(heading, 'tabindex'), '-1', `${name} heading must accept focus`);
  }
});

test('local exports are distinct buttons inside one accessible group', () => {
  const groupStart = startTagById('save-local');
  assert.equal(attribute(groupStart, 'role'), 'group');
  assert.ok(attribute(groupStart, 'aria-label') || attribute(groupStart, 'aria-labelledby'), 'local export group needs an accessible name');

  const groupTag = groupStart.match(/^<(\w+)/)?.[1];
  const groupIndex = html.indexOf(groupStart);
  const groupEnd = html.indexOf(`</${groupTag}>`, groupIndex);
  assert.ok(groupEnd > groupIndex, '#save-local must have a closing tag');
  const group = html.slice(groupIndex, groupEnd);
  for (const id of ['save-local-csv', 'save-local-geojson']) {
    const button = group.match(new RegExp(`<button\\b(?=[^>]*\\sid=(?:"${id}"|'${id}'))[^>]*>`, 'i'))?.[0];
    assert.ok(button, `#${id} must be a button within #save-local`);
    assert.equal(attribute(button, 'type'), 'button');
  }
});

test('CSS provides accessible targets and reduced-motion behavior', () => {
  assert.match(css, /button\s*\{[^}]*min-height\s*:\s*44px/si);
  assert.match(css, /#help\s*\{[^}]*min-width\s*:\s*44px/si, 'icon-only Help needs a 44px inline target');
  assert.match(css, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/i);
  assert.match(css, /scroll-behavior\s*:\s*auto\s*!important/i);
  assert.match(css, /transition\s*:\s*none\s*!important/i);
});

test('Dashboard Leaflet zoom anchors retain 44px targets on touch devices', () => {
  assert.match(css, /#dashboard-map\s+\.leaflet-control-zoom\s+a\s*\{[^}]*min-width\s*:\s*44px[^}]*min-height\s*:\s*44px[^}]*width\s*:\s*44px[^}]*height\s*:\s*44px/si);
  assert.match(css, /#dashboard-map\.leaflet-touch\s+\.leaflet-control-zoom\s+a\s*\{[^}]*min-width\s*:\s*44px[^}]*min-height\s*:\s*44px[^}]*width\s*:\s*44px[^}]*height\s*:\s*44px/si);
});

test('narrow fixed two-row navigation reserves 128px plus the safe area', () => {
  assert.match(css, /@media\s*\(max-width\s*:\s*799px\)[\s\S]*?\.portal-view:not\(\.view-login\)\s*\{[^}]*padding-bottom\s*:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom\)\)/i);
  assert.match(css, /\.portal-nav\s*\{[^}]*position\s*:\s*fixed/si);
  assert.match(css, /@media\s*\(max-width\s*:\s*799px\)[\s\S]*?\.portal-nav\s*\{[^}]*min-height\s*:\s*calc\(128px\s*\+\s*env\(safe-area-inset-bottom\)\)/si);
});

test('desktop Tracking map, OSM attribution, and legend end above fixed navigation', () => {
  const mapArea = html.match(/<div class="maparea">([\s\S]*?)<\/div>\s*<div class="bottom">/i)?.[1];
  assert.ok(mapArea?.includes('class="legend"'), 'legend must stay inside the protected map area');
  assert.match(app, /attribution\s*:\s*(['"])[\s\S]*?OpenStreetMap[\s\S]*?\1/i);
  assert.match(css, /\.leaflet-control-attribution\s*\{/i);
  assert.match(css, /@media\s*\(min-width\s*:\s*800px\)[\s\S]*?\.view-tracking\s*\{[^}]*padding-bottom\s*:\s*var\(--portal-nav-height\)/si);
  assert.match(css, /@media\s*\(min-width\s*:\s*800px\)[\s\S]*?\.view-tracking\s+\.maparea\s*\{[^}]*height\s*:\s*calc\(100dvh\s*-\s*82px\s*-\s*var\(--portal-nav-height\)\)[^}]*min-height\s*:\s*0/si);
  assert.doesNotMatch(css, /\.view-tracking\s+\.maparea\s*\{[^}]*min-height\s*:\s*650px/si);
});

test('ships the session-only portal controller without instantiating it early', () => {
  assert.match(html, /<link\b[^>]*rel="modulepreload"[^>]*href="portal-controller\.mjs"/i);
  assert.doesNotMatch(html, /<script\b[^>]*src="portal-controller\.mjs"/i);
  assert.match(portalController, /from ['"]\.\/portal-domain\.mjs['"]/);
  assert.match(portalController, /onEnterTracking/);
  assert.match(portalController, /onLeaveTracking/);
  assert.doesNotMatch(portalController, /localStorage/);
  assert.deepEqual(
    [...new Set(portalController.match(/vanguard\.demo\.[a-z]+/g))].sort(),
    ['vanguard.demo.auth', 'vanguard.demo.region']
  );
});

test('app starts the portal controller with Tracking lifecycle callbacks', () => {
  assert.match(app, /import\s*\{\s*createPortalController\s*\}\s*from\s*['"]\.\/portal-controller\.mjs['"]/);
  assert.match(app, /createPortalController\s*\(\s*\{[\s\S]*?\bdocument\s*,[\s\S]*?\bwindow\s*,[\s\S]*?leaflet\s*:\s*window\.L\s*,[\s\S]*?onEnterTracking\s*:\s*enterTracking\s*,[\s\S]*?onLeaveTracking\s*:\s*leaveTracking[\s\S]*?\}\s*\)/);
  assert.match(app, /\bportalController\.start\s*\(\s*\)/);
});

test('Tracking map is lazy, reused, and resized whenever Tracking is entered', () => {
  const initializer = app.match(/function\s+initializeTrackingMap\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(initializer, 'missing initializeTrackingMap');
  assert.match(initializer, /if\s*\(\s*trackingMapInitialized\s*\)\s*return/);
  assert.match(initializer, /trackingMapInitialized\s*=\s*true/);
  assert.match(initializer, /leaflet\.map\s*\(\s*['"]map['"]/);

  const enter = app.match(/function\s+enterTracking\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(enter, 'missing enterTracking');
  assert.match(enter, /initializeTrackingMap\s*\(\s*\)/);
  assert.match(enter, /map\?\.invalidateSize\s*\(/);
});

test('explicit Stop pauses simulation and Tracking cleanup clears GPS', () => {
  const stopButton = startTagById('tracking-stop');
  assert.equal(stopButton.match(/^<(\w+)/)?.[1], 'button');
  assert.equal(attribute(stopButton, 'type'), 'button');
  assert.match(app, /\$\(\s*['"]tracking-stop['"]\s*\)\.onclick\s*=\s*stop/);

  const stop = app.match(/function\s+stop\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(stop, 'missing stop');
  assert.match(stop, /feed\.pause\s*\(\s*\)/);
  assert.match(stop, /running\s*=\s*false/);

  const leave = app.match(/function\s+leaveTracking\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(leave, 'missing leaveTracking');
  assert.match(leave, /stop\s*\(\s*\)/);
  assert.match(leave, /clearGPS\s*\(\s*\)/);
  assert.match(leave, /own\s*=\s*pointAt\s*\(\s*0\s*\)/, 'cleanup must discard the last real user position');
});

test('Tracking cleanup makes the marker and viewport synthetic before restoring OSM tiles', () => {
  const calls = [];
  const safePoint = [13.1, 100.1];
  const safeViewport = { syntheticRoute: true };
  const tiles = { addTo() { calls.push('add:tiles'); } };
  const user = {
    setLatLng(point) { calls.push(`reset:user:${point.join(',')}`); return this; },
    setOpacity(value) { calls.push(`opacity:user:${value}`); return this; }
  };
  const map = {
    stop() { calls.push('stop:map'); },
    hasLayer() { return false; },
    removeLayer(layer) { calls.push(layer === user ? 'remove:user' : 'remove:other'); },
    fitBounds(viewport) { calls.push(viewport === safeViewport ? 'fit:synthetic-route' : 'fit:other'); }
  };
  const leaflet = {
    latLngBounds(route) {
      assert.deepEqual(route, ['synthetic-road']);
      return { pad() { return safeViewport; } };
    }
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} }, textContent: '' });
    return elements.get(id);
  };
  const runCleanup = new Function(
    '$', 'stop', 'clearGPS', 'pointAt', 'window', 'map', 'tiles', 'user', 'leaflet', 'anchors',
    'camera', 'gpsMode', 'own', 'ownTime', 'staleTimer',
    `${functionDeclaration('leaveTracking')}; leaveTracking(); return { camera, own };`
  );

  const result = runCleanup(
    element,
    () => calls.push('stop:feed'),
    () => calls.push('clear:gps'),
    () => safePoint,
    { clearInterval() { calls.push('clear:stale'); } },
    map,
    tiles,
    user,
    leaflet,
    ['synthetic-road'],
    'user',
    true,
    [51.5, -0.1],
    Date.now(),
    9
  );

  const markerRemoval = calls.indexOf('remove:user');
  const markerReset = calls.indexOf('reset:user:13.1,100.1');
  const safeRecenter = calls.indexOf('fit:synthetic-route');
  const tileRestore = calls.indexOf('add:tiles');
  assert.ok(markerRemoval >= 0, `user marker was not removed: ${calls.join(' → ')}`);
  assert.ok(markerReset > markerRemoval, `user marker was not reset after removal: ${calls.join(' → ')}`);
  assert.ok(safeRecenter > markerReset, `map was not safely recentered after marker reset: ${calls.join(' → ')}`);
  assert.ok(tileRestore > safeRecenter, `OSM tiles restored before cleanup completed: ${calls.join(' → ')}`);
  assert.deepEqual(result, { camera: 'target', own: safePoint });
});

test('GPS selection restarts stale monitoring after visibility cleanup', () => {
  const intervals = [];
  const cleared = [];
  const window = {
    setInterval(callback, delay) {
      const id = intervals.length + 1;
      intervals.push({ id, callback, delay });
      return id;
    },
    clearInterval(id) { cleared.push(id); }
  };
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} }, textContent: '' });
    return elements.get(id);
  };
  const tiles = { addTo() {} };
  const user = { setLatLng() { return this; }, setOpacity() { return this; } };
  const map = {
    invalidateSize() {},
    stop() {},
    hasLayer() { return false; },
    removeLayer() {},
    fitBounds() {}
  };
  const navigator = {
    geolocation: {
      watchPosition() { return 42; }
    }
  };
  const runLifecycle = new Function(
    '$', 'window', 'navigator', 'map', 'tiles', 'user', 'leaflet', 'anchors', 'pointAt',
    'initializeTrackingMap', 'refreshStaleGPS', 'render', 'updateExportAvailability', 'stop',
    `let staleTimer = null;
     let gpsMode = false;
     let own = null;
     let ownTime = 0;
     let camera = 'target';
     let generation = 0;
     let watch = null;
     let accuracy = null;
     function clearGPS() { generation += 1; watch = null; }
     ${functionDeclaration('enterTracking')}
     ${functionDeclaration('leaveTracking')}
     ${functionDeclaration('useGPSPosition')}
     enterTracking();
     leaveTracking();
     useGPSPosition();
     return { staleTimer, gpsMode, watch };`
  );

  const result = runLifecycle(
    element,
    window,
    navigator,
    map,
    tiles,
    user,
    { latLngBounds() { return { pad() { return {}; } }; } },
    ['synthetic-road'],
    () => [13.1, 100.1],
    () => {},
    () => {},
    () => {},
    () => {},
    () => {}
  );

  assert.deepEqual(intervals.map(({ id, delay }) => [id, delay]), [[1, 5000], [2, 5000]]);
  assert.deepEqual(cleared, [1]);
  assert.deepEqual(result, { staleTimer: 2, gpsMode: true, watch: 42 });
});

test('collects only matched synthetic FakeBTS events with the five public keys', () => {
  assert.match(app, /const\s+syntheticTrack\s*=\s*\[\s*\]/);
  assert.match(app, /if\s*\(\s*event\.status\s*===\s*['"]matched['"]\s*\)\s*\{[\s\S]*?syntheticTrack\.push/);

  const record = app.match(/syntheticTrack\.push\s*\(\s*\{([\s\S]*?)\}\s*\)/)?.[1];
  assert.ok(record, 'missing syntheticTrack record');
  const keys = [...record.matchAll(/\b([a-z]+)\s*:/g)].map(match => match[1]);
  assert.deepEqual(keys, ['timestamp', 'status', 'latitude', 'longitude', 'confidence']);
  assert.match(record, /timestamp\s*:\s*event\.timestamp/);
  assert.match(record, /status\s*:\s*event\.status/);
  assert.match(record, /latitude\s*:\s*event\.latitude/);
  assert.match(record, /longitude\s*:\s*event\.longitude/);
  assert.match(record, /confidence\s*:\s*event\.confidence/);
  assert.doesNotMatch(record, /\bown\b|coords|accuracy/i);
});

test('export controls appear only for a stopped or completed track with matched points', () => {
  const availability = app.match(/function\s+updateExportAvailability\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(availability, 'missing export availability gate');
  assert.match(availability, /\$\(\s*['"]export-panel['"]\s*\)\.hidden\s*=\s*running\s*\|\|\s*syntheticTrack\.length\s*===\s*0/);

  const stop = app.match(/function\s+stop\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.match(stop, /updateExportAvailability\s*\(\s*\)/);
  assert.match(app, /feed\.start\s*\([\s\S]*?\(\s*\)\s*=>\s*\{[\s\S]*?running\s*=\s*false[\s\S]*?updateExportAvailability\s*\(\s*\)/);
});

test('wires distinct privacy-safe CSV, GeoJSON, and Drive export actions with a live result', () => {
  assert.match(app, /from ['"]\.\/export-track\.mjs['"]/);
  assert.match(app, /\$\(\s*['"]save-local-csv['"]\s*\)\.onclick\s*=/);
  assert.match(app, /\$\(\s*['"]save-local-geojson['"]\s*\)\.onclick\s*=/);
  assert.match(app, /\$\(\s*['"]save-drive['"]\s*\)\.onclick\s*=/);
  assert.match(app, /buildTrackCsv\s*\(\s*syntheticTrack\s*\)/);
  assert.match(app, /buildTrackGeoJson\s*\(\s*syntheticTrack\s*\)/);
  assert.match(app, /shareTrackToDrive\s*\(\s*syntheticTrack\s*\)/);
  const result = startTagById('export-result');
  assert.equal(attribute(result, 'aria-live'), 'polite');
  assert.doesNotMatch(app, /console\.(?:log|info|debug)[\s\S]*?(?:latitude|longitude|syntheticTrack)/i);
});

test('PWA manifest identifies the portal and opens the portal shell', () => {
  assert.equal(manifest.name, 'Vanguard FakeBTS Portal Demo');
  assert.equal(manifest.short_name, 'Vanguard');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
});

test('service worker caches the complete same-origin portal shell and replaces old versions', () => {
  assert.match(serviceWorker, /const\s+CACHE\s*=\s*['"]vanguard-road-v3['"]/);
  for (const file of [
    './', './index.html', './style.css', './app.js', './domain.mjs', './road-route.mjs',
    './portal-domain.mjs', './portal-controller.mjs', './export-track.mjs',
    './leaflet.js', './leaflet.css', './manifest.webmanifest', './icon-192.png', './icon-512.png'
  ]) assert.match(serviceWorker, new RegExp(`['"]${file.replaceAll('.', '\\.')}['"]`), `missing ${file} from the application shell`);
  assert.match(serviceWorker, /\.filter\(\s*\w+\s*=>\s*\w+\.startsWith\(['"]vanguard-['"]\)\s*&&\s*\w+\s*!==\s*CACHE\s*\)/s);
  assert.match(serviceWorker, /caches\.delete\(\w+\)/);
});

test('service worker leaves OSM and third-party Leaflet requests network-only', () => {
  assert.match(serviceWorker, /\w+\.request\.method\s*!==\s*['"]GET['"]\s*\|\|\s*\w+\.origin\s*!==\s*(?:self\.)?location\.origin/);
  assert.doesNotMatch(serviceWorker, /cache(?:s|\.open\(CACHE\)[\s\S]*?)\.put\s*\(/i);
  const originGuard = serviceWorker.search(/\w+\.origin\s*!==\s*(?:self\.)?location\.origin/);
  const response = serviceWorker.search(/\w+\.respondWith\s*\(/);
  assert.ok(originGuard >= 0 && response > originGuard, 'third-party requests must return before cache handling');
});
