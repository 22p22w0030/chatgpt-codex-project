import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortalController } from '../dist/portal-controller.mjs';
import { REGIONS } from '../dist/portal-domain.mjs';

test('exports the portal controller factory', () => {
  assert.equal(typeof createPortalController, 'function');
});

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...init
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument, { id = '', dataset = {} } = {}) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = id;
    this.dataset = { ...dataset };
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.children = [];
    this.parentNode = null;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const add = force ?? !classes.has(name);
        add ? classes.add(name) : classes.delete(name);
        return add;
      }
    };
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.textContent = '';
    this.append(...children);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelector(selector) {
    if (selector === 'h1') return this.children.find(child => child.tagName === 'H1') ?? null;
    return null;
  }
}

class FakeStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class FakeDocument extends FakeEventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.activeElement = null;
    this.byId = new Map();
    this.views = [];
    this.openers = [];
    this.nav = this.make('nav');
    this.nav.hidden = true;

    for (const name of ['login', 'home', 'dashboard', 'regions', 'result', 'tracking']) {
      const view = this.make('section', { dataset: { view: name } });
      view.hidden = name !== 'login';
      view.append(this.make('h1'));
      this.views.push(view);
    }

    for (const id of [
      'login-form', 'login-error', 'login-username', 'login-password',
      'dashboard-map', 'dashboard-total', 'dashboard-region-summary', 'region-list', 'province-filter',
      'province-ranking', 'result-state', 'open-tracking', 'nav-back',
      'nav-home', 'nav-logout'
    ]) this.make(id === 'login-form' ? 'form' : id === 'province-filter' ? 'select' : 'div', { id });

    for (const view of ['dashboard', 'regions']) {
      const button = this.make('button', { dataset: { openView: view } });
      this.openers.push(button);
    }
  }

  make(tagName, options = {}) {
    const element = new FakeElement(tagName, this, options);
    if (element.id) this.byId.set(element.id, element);
    return element;
  }

  createElement(tagName) { return this.make(tagName); }
  getElementById(id) { return this.byId.get(id) ?? null; }
  querySelector(selector) { return selector === '.portal-nav' ? this.nav : null; }
  querySelectorAll(selector) {
    if (selector === '[data-view]') return this.views;
    if (selector === '[data-open-view]') return this.openers;
    if (selector === '[data-region]') {
      return this.getElementById('region-list').children.filter(element => element.dataset.region);
    }
    return [];
  }
}

class FakeWindow extends FakeEventTarget {
  constructor(storage = {}) {
    super();
    this.sessionStorage = new FakeStorage(storage);
    Object.defineProperty(this, 'localStorage', {
      get() { throw new Error('localStorage must never be accessed'); }
    });
    this.location = { hash: '' };
    this.history = {
      state: null,
      entries: [],
      pushState: (state, _title, url) => {
        this.history.state = state;
        this.history.entries.push({ state, url });
        this.location.hash = url;
      },
      replaceState: (state, _title, url) => {
        this.history.state = state;
        if (this.history.entries.length) this.history.entries.at(-1).state = state;
        else this.history.entries.push({ state, url });
        this.location.hash = url;
      }
    };
  }
}

function fixture({ storage, leaflet, onEnterTracking, onLeaveTracking } = {}) {
  const document = new FakeDocument();
  const window = new FakeWindow(storage);
  const controller = createPortalController({
    document,
    window,
    leaflet,
    onEnterTracking,
    onLeaveTracking
  });
  return { controller, document, window };
}

function visibleView(document) {
  return document.views.find(view => !view.hidden)?.dataset.view;
}

test('start gates unauthenticated deep links and focuses Login', () => {
  const { controller, document, window } = fixture();
  window.location.hash = '#dashboard';

  controller.start();

  assert.equal(controller.currentView, 'login');
  assert.equal(visibleView(document), 'login');
  assert.equal(document.nav.hidden, true);
  assert.equal(document.activeElement, document.views[0].children[0]);
  assert.deepEqual([...window.sessionStorage.values], []);
});

test('login rejects incorrect credentials and stores only session auth on success', () => {
  const { controller, document, window } = fixture();
  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  controller.start();

  document.getElementById('login-username').value = 'vanguard';
  document.getElementById('login-password').value = 'wrong';
  form.dispatch('submit');
  assert.equal(controller.currentView, 'login');
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /ไม่ถูกต้อง/);

  document.getElementById('login-password').value = 'demo1234';
  form.dispatch('submit');
  assert.equal(controller.currentView, 'home');
  assert.equal(window.sessionStorage.getItem('vanguard.demo.auth'), 'true');
  assert.deepEqual([...window.sessionStorage.values.keys()], ['vanguard.demo.auth']);
  assert.equal(document.getElementById('login-password').value, '');
  assert.equal(document.nav.hidden, false);
});

test('region selection persists the valid region and renders ranked province results', () => {
  const { controller, document, window } = fixture({ storage: { 'vanguard.demo.auth': 'true' } });
  controller.start();

  document.querySelectorAll('[data-region]').find(button => button.dataset.region === 'NR').dispatch('click');

  assert.equal(controller.currentView, 'result');
  assert.equal(controller.selectedRegion, 'NR');
  assert.equal(window.sessionStorage.getItem('vanguard.demo.region'), 'NR');
  assert.deepEqual(document.getElementById('province-ranking').children.map(item => item.textContent), [
    'Chiang Mai — 3', 'Chiang Rai — 1', 'Phitsanulok — 1'
  ]);
  assert.equal(document.getElementById('result-state').children[1].textContent, 'Under Construction');
  assert.equal(document.getElementById('open-tracking').hidden, true);

  const filter = document.getElementById('province-filter');
  filter.value = 'Chiang Rai';
  filter.dispatch('change');
  assert.deepEqual(document.getElementById('province-ranking').children.map(item => item.textContent), ['Chiang Rai — 1']);
});

test('only BKK can enter Tracking and lifecycle callbacks surround view changes', () => {
  const events = [];
  let document;
  const result = fixture({
    storage: { 'vanguard.demo.auth': 'true', 'vanguard.demo.region': 'BKK' },
    onEnterTracking: () => events.push(`enter:${visibleView(document)}`),
    onLeaveTracking: () => events.push(`leave:${visibleView(document)}`)
  });
  ({ document } = result);
  result.controller.start();
  result.controller.navigate('tracking');
  result.controller.navigate('home');

  assert.deepEqual(events, ['enter:tracking', 'leave:tracking']);
  assert.equal(result.controller.currentView, 'home');

  document.querySelectorAll('[data-region]').find(button => button.dataset.region === 'ER').dispatch('click');
  result.controller.navigate('tracking');
  assert.equal(result.controller.currentView, 'result');
  assert.deepEqual(events, ['enter:tracking', 'leave:tracking']);
});

test('start hydrates all dashboard and Region Selection labels and counts from REGIONS', () => {
  const { controller, document, window } = fixture({ storage: { 'vanguard.demo.auth': 'true' } });
  const summary = document.getElementById('dashboard-region-summary');
  const regionList = document.getElementById('region-list');
  assert.equal(summary.children.length, 0);
  assert.equal(regionList.children.length, 0);

  controller.start();

  const expected = REGIONS.map(({ id, name, total }) => [id, name, String(total)]);
  assert.deepEqual(summary.children.map(row => [
    row.children[0].textContent,
    row.children[1].textContent
  ]), expected.map(([id, _name, total]) => [id, total]));
  assert.deepEqual(regionList.children.map(button => [
    button.dataset.region,
    button.children[0].textContent,
    button.children[1].textContent
  ]), expected.map(([id, name, total]) => [id, name, total]));
  assert.deepEqual(regionList.children.map(button => [button.type, button.children[2].textContent]), [
    ['button', 'BKK'], ['button', 'NR'], ['button', 'ER'],
    ['button', 'NER'], ['button', 'SR'], ['button', 'CR']
  ]);

  for (const region of REGIONS) {
    controller.navigate('regions');
    regionList.children.find(button => button.dataset.region === region.id).dispatch('click');
    assert.equal(controller.currentView, 'result');
    assert.equal(controller.selectedRegion, region.id);
    assert.equal(window.sessionStorage.getItem('vanguard.demo.region'), region.id);
  }
});

test('a Tracking deep link without a valid selected region settles on Region selection', () => {
  const { controller, window } = fixture({ storage: { 'vanguard.demo.auth': 'true' } });
  window.location.hash = '#tracking';

  controller.start();

  assert.equal(controller.currentView, 'regions');
  assert.equal(window.location.hash, '#regions');
});

test('Back, Home, Logout, browser navigation, and lifecycle events clean up Tracking', () => {
  const cleanupRoutes = [];
  let document;
  const result = fixture({
    storage: { 'vanguard.demo.auth': 'true', 'vanguard.demo.region': 'BKK' },
    onLeaveTracking: () => cleanupRoutes.push(visibleView(document))
  });
  ({ document } = result);
  const { controller, window } = result;
  controller.start();

  for (const [leave, expected] of [
    [() => document.getElementById('nav-back').dispatch('click'), 'result'],
    [() => document.getElementById('nav-home').dispatch('click'), 'home'],
    [() => window.dispatch('popstate', { state: { view: 'regions' } }), 'regions']
  ]) {
    controller.navigate('tracking');
    leave();
    assert.equal(controller.currentView, expected);
  }

  controller.navigate('tracking');
  document.hidden = true;
  document.dispatch('visibilitychange');
  window.dispatch('pagehide');
  document.getElementById('nav-logout').dispatch('click');
  assert.equal(controller.currentView, 'login');
  assert.equal(window.sessionStorage.getItem('vanguard.demo.auth'), null);
  assert.equal(window.sessionStorage.getItem('vanguard.demo.region'), null);
  assert.deepEqual(cleanupRoutes, ['tracking', 'tracking', 'tracking', 'tracking', 'tracking', 'tracking']);
});

test('Dashboard initializes one Thailand Leaflet map with all regional count markers', () => {
  const calls = { maps: 0, markers: [], tileOptions: null, invalidations: 0 };
  const map = {
    setView(center, zoom) { calls.center = center; calls.zoom = zoom; return this; },
    invalidateSize() { calls.invalidations += 1; },
    remove() {}
  };
  const leaflet = {
    map() { calls.maps += 1; return map; },
    tileLayer(_url, options) {
      calls.tileOptions = options;
      return { addTo() { return this; }, on() { return this; } };
    },
    divIcon(options) { return options; },
    marker(position, options) {
      calls.markers.push({ position, html: options.icon.html });
      return { addTo() { return this; }, bindTooltip() { return this; } };
    }
  };
  const { controller } = fixture({ storage: { 'vanguard.demo.auth': 'true' }, leaflet });
  controller.start();
  controller.navigate('dashboard');
  controller.navigate('home');
  controller.navigate('dashboard');

  assert.equal(calls.maps, 1);
  assert.deepEqual(calls.center, [13.2, 101]);
  assert.equal(calls.zoom, 5);
  assert.deepEqual(calls.markers.map(marker => marker.html.match(/>(\d+)</)?.[1]), ['10', '5', '2', '0', '0', '0']);
  assert.match(calls.tileOptions.attribution, /OpenStreetMap/);
  assert.equal(calls.invalidations, 1);
});

test('Dashboard map failure is contained to the map while totals and navigation remain', () => {
  const leaflet = { map() { throw new Error('map unavailable'); } };
  const { controller, document } = fixture({ storage: { 'vanguard.demo.auth': 'true' }, leaflet });
  controller.start();
  controller.navigate('dashboard');

  assert.equal(controller.currentView, 'dashboard');
  assert.equal(document.getElementById('dashboard-total').textContent, '17');
  assert.match(document.getElementById('dashboard-map').textContent, /แผนที่.*ไม่ได้/);
  assert.equal(document.nav.hidden, false);
});

test('destroy removes controller listeners and cleans an active Tracking view', () => {
  let leaves = 0;
  const { controller, document } = fixture({
    storage: { 'vanguard.demo.auth': 'true', 'vanguard.demo.region': 'BKK' },
    onLeaveTracking: () => { leaves += 1; }
  });
  controller.start();
  controller.navigate('tracking');
  controller.destroy();
  document.getElementById('nav-home').dispatch('click');

  assert.equal(leaves, 1);
  assert.equal(controller.currentView, 'tracking');
});
