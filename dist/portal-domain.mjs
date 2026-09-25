// Pure, session-only data and routing rules for the Vanguard demo portal.
const freezeRegion = (region) => Object.freeze({
  id: region.id,
  name: region.name,
  total: region.total,
  provinces: Object.freeze(region.provinces.map((province) => Object.freeze({ ...province })))
});

export const DEMO_USERNAME = 'vanguard';

export const REGIONS = Object.freeze([
  freezeRegion({ id: 'BKK', name: 'Bangkok', total: 10, provinces: [{ name: 'Bangkok', count: 10 }] }),
  freezeRegion({ id: 'NR', name: 'Northern Region', total: 5, provinces: [
    { name: 'Chiang Mai', count: 3 }, { name: 'Chiang Rai', count: 1 }, { name: 'Phitsanulok', count: 1 }
  ] }),
  freezeRegion({ id: 'ER', name: 'Eastern Region', total: 2, provinces: [
    { name: 'Chonburi', count: 1 }, { name: 'Rayong', count: 1 }
  ] }),
  freezeRegion({ id: 'NER', name: 'Northeastern Region', total: 0, provinces: [] }),
  freezeRegion({ id: 'SR', name: 'Southern Region', total: 0, provinces: [] }),
  freezeRegion({ id: 'CR', name: 'Central Region', total: 0, provinces: [] })
]);

export const dashboardTotal = REGIONS.reduce((sum, region) => sum + region.total, 0);

export function authenticateDemo(username, password) {
  return username === DEMO_USERNAME && password === 'demo1234';
}

export function getRegion(regionId) {
  return REGIONS.find(({ id }) => id === regionId);
}

export function rankProvinces(regionId, provinceFilter = '') {
  const region = getRegion(regionId);
  if (!region) return [];
  return region.provinces
    .filter(({ name }) => provinceFilter === '' || name === provinceFilter)
    .slice()
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function regionOutcome(regionId) {
  if (regionId === 'BKK') return 'tracking';
  if (regionId === 'NR' || regionId === 'ER') return 'under_construction';
  return 'not_found';
}

const VIEWS = new Set(['login', 'home', 'dashboard', 'regions', 'result', 'tracking']);

export function resolveView(input, authenticated, region) {
  const options = typeof input === 'object' && input !== null
    ? input
    : { requestedView: input, authenticated, region };
  const isAuthenticated = options.authenticated === true;
  const requestedView = options.requestedView ?? options.view;
  const selectedRegion = options.region ?? options.selectedRegion;
  if (!isAuthenticated) return 'login';
  if (requestedView === 'login' || !VIEWS.has(requestedView)) return 'home';
  if (requestedView === 'tracking' && selectedRegion !== 'BKK') return 'result';
  if (requestedView === 'result' && !getRegion(selectedRegion)) return 'regions';
  return requestedView;
}
