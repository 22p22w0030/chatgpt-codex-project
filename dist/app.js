import {
  distance,
  reduce,
  initial,
  anchors,
  pointAt,
  makeFeed,
  roadSlice,
  routeLength
} from './domain.mjs';
import { createPortalController } from './portal-controller.mjs';
import {
  buildTrackCsv,
  buildTrackGeoJson,
  downloadTrack,
  shareTrackToDrive
} from './export-track.mjs';

const $ = id => document.getElementById(id);
const leaflet = window.L;
const syntheticTrack = [];

let state = initial();
let own = null;
let ownTime = 0;
let watch = null;
let generation = 0;
let gpsMode = false;
let running = false;
let camera = 'target';
let map;
let tiles;
let target;
let user;
let accuracy;
let path;
let trackingMapInitialized = false;
let staleTimer = null;
const feed = makeFeed();
let roadSpans = [];
let roadGap = true;

function initializeTrackingMap() {
  if (trackingMapInitialized) return;
  trackingMapInitialized = true;
  if (!leaflet) {
    $('map').textContent = 'ไม่สามารถโหลดแผนที่ได้ กรุณาโหลดแอปอีกครั้ง';
    return;
  }

  try {
    map = leaflet.map('map', { zoomControl: false }).setView(anchors[1], 14);
    tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    tiles.on('tileerror', () => {
      $('maplabel').textContent = 'แผนที่โหลดไม่ได้ · ถนน OSM';
    });
    const icon = who => leaflet.divIcon({
      className: '',
      html: `<div class="pin ${who}"></div>`,
      iconSize: [23, 23],
      iconAnchor: [11, 11]
    });
    target = leaflet.marker(anchors[0], { icon: icon('') })
      .bindTooltip('เป้าหมายจำลอง', { offset: [12, 0], direction: 'right' });
    user = leaflet.marker(pointAt(0), { icon: icon('user') }).addTo(map);
    path = leaflet.layerGroup().addTo(map);
    leaflet.polyline(anchors, {
      color: '#66838d',
      weight: 4,
      opacity: 0.5,
      dashArray: '5 9',
      smoothFactor: 0
    }).addTo(map);
    map.on('dragstart', () => { camera = 'free'; });
    map.fitBounds(leaflet.latLngBounds(anchors).pad(0.15), { animate: false });
  } catch {
    map?.remove?.();
    map = undefined;
    $('map').textContent = 'ไม่สามารถโหลดแผนที่ได้ กรุณาโหลดแอปอีกครั้ง';
  }
}

function status(text, warn = false) {
  $('status').textContent = text;
  $('status').className = warn ? 'warn' : '';
}

function updateExportAvailability() {
  $('export-panel').hidden = running || syntheticTrack.length === 0;
}

function setExportResult(message) {
  $('export-result').textContent = message;
}

function downloadCsv() {
  downloadTrack({
    content: buildTrackCsv(syntheticTrack),
    filename: 'vanguard-synthetic-track.csv',
    type: 'text/csv;charset=utf-8'
  });
  setExportResult('ดาวน์โหลด CSV ของเส้นทางเป้าหมายจำลองแล้ว');
}

function downloadGeoJson() {
  downloadTrack({
    content: JSON.stringify(buildTrackGeoJson(syntheticTrack)),
    filename: 'vanguard-synthetic-track.geojson',
    type: 'application/geo+json;charset=utf-8'
  });
  setExportResult('ดาวน์โหลด GeoJSON ของเส้นทางเป้าหมายจำลองแล้ว');
}

async function shareToDrive() {
  try {
    const result = await shareTrackToDrive(syntheticTrack);
    setExportResult(result === 'shared'
      ? 'เปิดหน้าต่างแชร์แล้ว · เลือก Google Drive เพื่ออัปโหลด'
      : 'ดาวน์โหลด GeoJSON แล้ว · อัปโหลดไปยัง Google Drive ได้ด้วยตนเอง');
  } catch {
    setExportResult('ไม่สามารถเปิดหน้าต่างแชร์ได้ · ลองดาวน์โหลด GeoJSON แทน');
  }
}

function render() {
  const event = state.event;
  const trusted = event?.status === 'matched';
  if (event) {
    $('updated').textContent = new Date(event.timestamp).toLocaleTimeString('th-TH', { hour12: false });
    $('confidence').textContent = trusted ? `${Math.round(event.confidence * 100)}%` : '—';
    status(
      !running
        ? (feed.completed ? 'สาธิตเสร็จแล้ว' : 'พักการติดตาม')
        : trusted
          ? 'กำลังติดตาม'
          : event.status === 'low_confidence'
            ? 'ความเชื่อมั่นต่ำ'
            : 'Unmatched',
      !trusted
    );
    $('notice').textContent = trusted
      ? `เป้าหมายจำลอง · วิ่งตามถนน OSM ${(routeLength / 1000).toFixed(2)} กม. · 36 กม./ชม. · ยังไม่เชื่อม HMM/Viterbi จริง`
      : `ไม่มีตำแหน่งที่เชื่อถือได้ · แสดงจุดล่าสุดที่ยืนยัน ${state.matchedTime ? new Date(state.matchedTime).toLocaleTimeString('th-TH') : ''}`;
  }

  const fresh = own && (!gpsMode || Date.now() - ownTime < 30000);
  if (trusted && fresh) {
    const metres = distance(own, state.target);
    $('distance').textContent = metres < 1000 ? `${Math.round(metres)} ม.` : `${(metres / 1000).toFixed(1)} กม.`;
  } else {
    $('distance').textContent = '—';
  }

  if (map && state.target) {
    if (!map.hasLayer(target)) target.addTo(map);
    target.setLatLng(state.target);
    target.setOpacity(trusted ? 1 : 0.4);
    path.clearLayers();
    for (const span of roadSpans) {
      leaflet.polyline(roadSlice(span[0], span[1]), {
        color: '#e65d50',
        weight: 5,
        smoothFactor: 0
      }).addTo(path);
    }
    if (camera === 'target' && trusted) map.panTo(state.target, { animate: false });
  }

  if (map && own) {
    user.setLatLng(own);
    user.setOpacity(fresh ? 1 : 0.35);
    if (!map.hasLayer(user)) user.addTo(map);
    if (camera === 'user') map.panTo(own, { animate: false });
  }
}

function stop() {
  feed.pause();
  running = false;
  $('start').textContent = feed.completed ? '↺ เล่นอีกครั้ง' : '▶ ติดตามต่อ';
  status(feed.completed ? 'สาธิตเสร็จแล้ว' : 'พักการติดตาม');
  updateExportAvailability();
}

function reset() {
  feed.reset();
  running = false;
  state = initial();
  syntheticTrack.length = 0;
  roadSpans = [];
  roadGap = true;
  $('start').textContent = '▶ เริ่มติดตาม';
  $('updated').textContent = '—';
  $('confidence').textContent = '—';
  $('distance').textContent = '—';
  status('พร้อมเริ่ม');
  $('notice').textContent = 'เป้าหมายจำลอง · กดเริ่มเพื่อทดลองติดตาม';
  updateExportAvailability();
  if (map) {
    path.clearLayers();
    map.removeLayer(target);
    target.setLatLng(anchors[0]).setOpacity(1);
    map.fitBounds(leaflet.latLngBounds(anchors).pad(0.15), { animate: false });
  }
  if (!gpsMode) {
    own = pointAt(0);
    render();
  }
}

function collectSyntheticEvent(event) {
  if (event.status === 'matched') {
    syntheticTrack.push({
      timestamp: event.timestamp,
      status: event.status,
      latitude: event.latitude,
      longitude: event.longitude,
      confidence: event.confidence
    });
  }
}

function startTracking() {
  if (running) {
    stop();
    return;
  }
  if (feed.completed) reset();
  running = true;
  updateExportAvailability();
  $('start').textContent = 'Ⅱ พักเป้าหมาย';
  status('กำลังติดตาม');
  feed.start((event, seconds) => {
    state = reduce(state, event);
    collectSyntheticEvent(event);
    if (event.status === 'matched') {
      if (roadGap) roadSpans.push([seconds, seconds]);
      else roadSpans.at(-1)[1] = seconds;
      roadGap = false;
    } else {
      roadGap = true;
    }
    if (!gpsMode) {
      own = pointAt(seconds - 12);
      ownTime = Date.now();
    }
    render();
  }, () => {
    running = false;
    $('start').textContent = '↺ เล่นอีกครั้ง';
    status('สาธิตเสร็จแล้ว');
    updateExportAvailability();
  });
}

function clearGPS() {
  generation += 1;
  if (watch !== null) {
    navigator.geolocation.clearWatch(watch);
    watch = null;
  }
  if (accuracy && map) {
    map.removeLayer(accuracy);
    accuracy = null;
  }
}

function useDemoPosition() {
  gpsMode = false;
  clearGPS();
  own = pointAt(0);
  $('gps').classList.remove('selected');
  $('demo').classList.add('selected');
  $('youlabel').textContent = 'ผู้ติดตามจำลอง';
  $('gpsstate').textContent = 'ตำแหน่งผู้ติดตาม: จำลอง';
  $('maplabel').textContent = 'แผนที่สาธิต · ถนน OSM';
  if (map) {
    map.stop();
    map.fitBounds(leaflet.latLngBounds(anchors).pad(0.15), { animate: false });
    if (!map.hasLayer(tiles)) tiles.addTo(map);
  }
  render();
}

function useGPSPosition() {
  if (gpsMode) return;
  gpsMode = true;
  if (staleTimer === null) staleTimer = window.setInterval(refreshStaleGPS, 5000);
  $('gps').classList.add('selected');
  $('demo').classList.remove('selected');
  own = null;
  clearGPS();
  if (map) {
    map.removeLayer(tiles);
    map.removeLayer(user);
  }
  $('maplabel').textContent = 'โหมด GPS · แผนที่ภายในเครื่อง';
  $('youlabel').textContent = 'คุณ · GPS จริง';
  $('gpsstate').textContent = 'กำลังขอตำแหน่ง…';
  render();
  if (!navigator.geolocation) {
    $('gpsstate').textContent = 'อุปกรณ์ไม่รองรับตำแหน่ง';
    return;
  }

  const ticket = generation;
  watch = navigator.geolocation.watchPosition(position => {
    if (!gpsMode || ticket !== generation) return;
    own = [position.coords.latitude, position.coords.longitude];
    ownTime = position.timestamp;
    if (map) {
      if (accuracy) map.removeLayer(accuracy);
      accuracy = leaflet.circle(own, {
        radius: position.coords.accuracy,
        color: '#278ded',
        weight: 1,
        fillOpacity: 0.12
      }).addTo(map);
    }
    $('gpsstate').textContent = `GPS จริง · ±${Math.round(position.coords.accuracy)} ม.`;
    render();
  }, error => {
    if (!gpsMode || ticket !== generation) return;
    $('gpsstate').textContent = error.code === 1
      ? 'ไม่ได้อนุญาตตำแหน่ง · จำลองเป้าหมายต่อได้'
      : error.code === 3
        ? 'GPS รอนานเกินไป'
        : 'ยังหาตำแหน่งไม่ได้';
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}

function refreshStaleGPS() {
  if (!gpsMode || !own || Date.now() - ownTime <= 30000) return;
  $('gpsstate').textContent = 'ตำแหน่งเก่า · รอ GPS อัปเดต';
  $('distance').textContent = '—';
  user?.setOpacity(0.35);
  if (accuracy && map) {
    map.removeLayer(accuracy);
    accuracy = null;
  }
}

function enterTracking() {
  initializeTrackingMap();
  map?.invalidateSize({ animate: false });
  if (staleTimer === null) staleTimer = window.setInterval(refreshStaleGPS, 5000);
  render();
  updateExportAvailability();
}

function leaveTracking() {
  stop();
  clearGPS();
  gpsMode = false;
  own = pointAt(0);
  ownTime = 0;
  if (staleTimer !== null) {
    window.clearInterval(staleTimer);
    staleTimer = null;
  }
  $('gps').classList.remove('selected');
  $('demo').classList.add('selected');
  $('youlabel').textContent = 'ผู้ติดตามจำลอง';
  $('gpsstate').textContent = 'ตำแหน่งผู้ติดตาม: จำลอง';
  $('maplabel').textContent = 'แผนที่สาธิต · ถนน OSM';
  if (map) {
    map.stop();
    map.removeLayer(user);
    user.setLatLng(own).setOpacity(1);
    camera = 'target';
    map.fitBounds(leaflet.latLngBounds(anchors).pad(0.15), { animate: false });
    if (!map.hasLayer(tiles)) tiles.addTo(map);
  }
}

$('start').onclick = startTracking;
$('tracking-stop').onclick = stop;
$('reset').onclick = reset;
$('save-local-csv').onclick = downloadCsv;
$('save-local-geojson').onclick = downloadGeoJson;
$('save-drive').onclick = shareToDrive;
$('gps').onclick = useGPSPosition;
$('demo').onclick = useDemoPosition;
$('follow').onclick = () => {
  camera = 'target';
  if (map) map.setView(state.target || anchors[0], 15, { animate: false });
};
$('me').onclick = () => {
  if (!own) {
    $('gpsstate').textContent = 'รอตำแหน่งผู้ใช้ก่อน';
    return;
  }
  camera = 'user';
  if (map) map.setView(own, 15, { animate: false });
};
$('fit').onclick = () => {
  camera = 'free';
  if (map) {
    map.fitBounds(leaflet.latLngBounds([state.target || anchors[0], own || anchors[0]]).pad(0.2), {
      maxZoom: 16,
      animate: false
    });
  }
};

$('help').onclick = () => $('dialog').showModal();
$('close').onclick = () => $('dialog').close();

let installPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
});
$('install').onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
  } else {
    $('dialog').showModal();
  }
};

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(registration => registration.update()).catch(() => {});
});

own = pointAt(0);
render();
updateExportAvailability();

const portalController = createPortalController({
  document,
  window,
  leaflet: window.L,
  onEnterTracking: enterTracking,
  onLeaveTracking: leaveTracking
});
portalController.start();

let reloading = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      location.reload();
    }
  });
}
