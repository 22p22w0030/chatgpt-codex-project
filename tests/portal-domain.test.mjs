import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS, DEMO_USERNAME, authenticateDemo, dashboardTotal, getRegion,
  rankProvinces, regionOutcome, resolveView
} from '../dist/portal-domain.mjs';

test('uses the approved demo credentials', () => {
  assert.equal(DEMO_USERNAME, 'vanguard');
  assert.equal(authenticateDemo('vanguard', 'demo1234'), true);
  assert.equal(authenticateDemo('vanguard', 'wrong'), false);
  assert.equal(authenticateDemo('other', 'demo1234'), false);
});

test('dashboard total equals the exact sum of regional and province counts', () => {
  assert.equal(dashboardTotal, 17);
  assert.deepEqual(REGIONS.map(({ id, total }) => [id, total]), [
    ['BKK', 10], ['NR', 5], ['ER', 2], ['NER', 0], ['SR', 0], ['CR', 0]
  ]);
  assert.equal(REGIONS.reduce((sum, region) => sum + region.total, 0), dashboardTotal);
  assert.equal(REGIONS.reduce((sum, region) => sum + region.provinces.reduce((n, p) => n + p.count, 0), 0), dashboardTotal);
});

test('ranks provinces by descending count, then alphabetically for ties', () => {
  assert.deepEqual(rankProvinces('NR'), [
    { name: 'Chiang Mai', count: 3 },
    { name: 'Chiang Rai', count: 1 },
    { name: 'Phitsanulok', count: 1 }
  ]);
  assert.deepEqual(rankProvinces('ER'), [
    { name: 'Chonburi', count: 1 }, { name: 'Rayong', count: 1 }
  ]);
});

test('province ranking applies an exact region filter', () => {
  assert.deepEqual(rankProvinces('BKK'), [{ name: 'Bangkok', count: 10 }]);
  assert.deepEqual(rankProvinces('NR', 'Chiang Mai'), [{ name: 'Chiang Mai', count: 3 }]);
  assert.deepEqual(rankProvinces('NR', 'ang'), []);
});

test('returns region records and exact outcomes', () => {
  assert.equal(getRegion('BKK').provinces[0].name, 'Bangkok');
  assert.equal(regionOutcome('BKK'), 'tracking');
  assert.equal(regionOutcome('NR'), 'under_construction');
  assert.equal(regionOutcome('ER'), 'under_construction');
  for (const id of ['NER', 'SR', 'CR', 'unknown']) assert.equal(regionOutcome(id), 'not_found');
  assert.equal(getRegion('unknown'), undefined);
});

test('resolves authentication, region and tracking navigation outcomes', () => {
  assert.equal(resolveView({ authenticated: false, requestedView: 'dashboard' }), 'login');
  assert.equal(resolveView({ authenticated: true, requestedView: 'login' }), 'home');
  assert.equal(resolveView({ authenticated: true, requestedView: 'dashboard' }), 'dashboard');
  assert.equal(resolveView({ authenticated: true, requestedView: 'tracking', region: 'BKK' }), 'tracking');
  assert.equal(resolveView({ authenticated: true, requestedView: 'tracking', region: 'NR' }), 'result');
  assert.equal(resolveView({ authenticated: true, requestedView: 'result', region: 'NR' }), 'result');
  assert.equal(resolveView({ authenticated: true, requestedView: 'wat' }), 'home');
});
