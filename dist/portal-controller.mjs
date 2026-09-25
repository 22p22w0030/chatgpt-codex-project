import {
  REGIONS,
  authenticateDemo,
  dashboardTotal,
  getRegion,
  rankProvinces,
  regionOutcome,
  resolveView
} from './portal-domain.mjs';

const AUTH_KEY = 'vanguard.demo.auth';
const REGION_KEY = 'vanguard.demo.region';
const THAILAND_CENTER = [13.2, 101];
const REGION_POSITIONS = Object.freeze({
  BKK: [13.7563, 100.5018],
  NR: [18.7883, 98.9853],
  ER: [12.9236, 101.1289],
  NER: [16.4322, 102.8236],
  SR: [7.8804, 98.3923],
  CR: [14.3532, 100.5689]
});

export function createPortalController({
  document,
  window,
  leaflet,
  onEnterTracking = () => {},
  onLeaveTracking = () => {}
}) {
  const views = [...document.querySelectorAll('[data-view]')];
  const nav = document.querySelector('.portal-nav');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const provinceFilter = document.getElementById('province-filter');
  const provinceRanking = document.getElementById('province-ranking');
  const resultState = document.getElementById('result-state');
  const openTracking = document.getElementById('open-tracking');
  const dashboardMapElement = document.getElementById('dashboard-map');
  const dashboardTotalElement = document.getElementById('dashboard-total');
  const dashboardRegionSummary = document.getElementById('dashboard-region-summary');
  const regionList = document.getElementById('region-list');
  const backButton = document.getElementById('nav-back');
  const homeButton = document.getElementById('nav-home');
  const logoutButton = document.getElementById('nav-logout');

  let activeView = null;
  let regionId;
  let started = false;
  let destroyed = false;
  let dashboardMap = null;
  let dashboardMapAttempted = false;
  const removers = [];

  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  };

  const isAuthenticated = () => window.sessionStorage.getItem(AUTH_KEY) === 'true';

  const historyView = () => {
    const stateView = window.history.state?.view;
    if (stateView) return stateView;
    const hash = window.location.hash.replace(/^#/, '');
    return hash || (isAuthenticated() ? 'home' : 'login');
  };

  const setHistory = (mode, view) => {
    if (mode === 'none') return;
    const method = mode === 'push' ? 'pushState' : 'replaceState';
    window.history[method]({ view }, '', `#${view}`);
  };

  const focusHeading = view => {
    views.find(element => element.dataset.view === view)?.querySelector('h1')?.focus({ preventScroll: true });
  };

  const showDashboardMapFallback = () => {
    dashboardMapElement.textContent = 'แผนที่ประเทศไทยโหลดไม่ได้ · จำนวนสรุปและเมนูยังใช้งานได้';
  };

  const failDashboardMap = () => {
    dashboardMap?.remove?.();
    dashboardMap = null;
    showDashboardMapFallback();
  };

  const initializeDashboardMap = () => {
    if (dashboardMapAttempted) {
      dashboardMap?.invalidateSize();
      return;
    }
    dashboardMapAttempted = true;
    if (!leaflet) {
      showDashboardMapFallback();
      return;
    }

    try {
      dashboardMapElement.replaceChildren();
      dashboardMap = leaflet.map(dashboardMapElement, { zoomControl: true }).setView(THAILAND_CENTER, 5);
      const tiles = leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(dashboardMap);
      tiles.on?.('tileerror', failDashboardMap);

      for (const region of REGIONS) {
        const icon = leaflet.divIcon({
          className: '',
          html: `<span class="state-mark" aria-hidden="true">${region.total}</span>`,
          iconSize: [58, 58],
          iconAnchor: [29, 29]
        });
        leaflet.marker(REGION_POSITIONS[region.id], { icon })
          .addTo(dashboardMap)
          .bindTooltip(`${region.name}: ${region.total}`, { direction: 'top' });
      }
    } catch {
      failDashboardMap();
    }
  };

  const renderRanking = () => {
    provinceRanking.replaceChildren();
    for (const province of rankProvinces(regionId, provinceFilter.value)) {
      const item = document.createElement('li');
      item.textContent = `${province.name} — ${province.count}`;
      provinceRanking.append(item);
    }
  };

  const renderRegionCollections = () => {
    const summaries = [];
    const regionButtons = [];
    for (const region of REGIONS) {
      const summary = document.createElement('span');
      const summaryLabel = document.createElement('b');
      const summaryCount = document.createElement('output');
      summaryLabel.textContent = region.id;
      summaryCount.textContent = String(region.total);
      summary.append(summaryLabel, summaryCount);
      summaries.push(summary);

      const button = document.createElement('button');
      const name = document.createElement('span');
      const count = document.createElement('b');
      const code = document.createElement('small');
      button.type = 'button';
      button.dataset.region = region.id;
      name.textContent = region.name;
      count.textContent = String(region.total);
      code.textContent = region.id;
      button.append(name, count, code);
      regionButtons.push(button);
    }
    dashboardRegionSummary.replaceChildren(...summaries);
    regionList.replaceChildren(...regionButtons);
  };

  const renderResult = () => {
    const region = getRegion(regionId);
    if (!region) return;

    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'ทุกจังหวัด';
    const options = region.provinces.map(province => {
      const option = document.createElement('option');
      option.value = province.name;
      option.textContent = province.name;
      return option;
    });
    provinceFilter.replaceChildren(all, ...options);
    provinceFilter.value = '';
    provinceFilter.disabled = region.provinces.length === 0;
    renderRanking();

    const mark = document.createElement('span');
    mark.className = 'state-mark';
    mark.textContent = region.total > 0 ? String(region.total) : '—';
    const message = document.createElement('strong');
    const outcome = regionOutcome(region.id);
    message.textContent = outcome === 'tracking'
      ? `พร้อม Tracking · พบ ${region.total} จุด`
      : outcome === 'under_construction'
        ? 'Under Construction'
        : 'FakeBTS Not Found';
    resultState.className = `result-state ${outcome}`;
    resultState.replaceChildren(mark, message);
    openTracking.hidden = outcome !== 'tracking';
    openTracking.disabled = outcome !== 'tracking';
  };

  const transition = (requestedView, historyMode = 'push') => {
    let nextView = requestedView;
    for (let pass = 0; pass < 3; pass += 1) {
      const gatedView = resolveView({
        authenticated: isAuthenticated(),
        requestedView: nextView,
        region: regionId
      });
      if (gatedView === nextView) break;
      nextView = gatedView;
    }

    if (activeView === 'tracking' && nextView !== 'tracking') onLeaveTracking();
    if (nextView === 'result') renderResult();

    for (const view of views) view.hidden = view.dataset.view !== nextView;
    nav.hidden = nextView === 'login';
    backButton.hidden = nextView === 'login' || nextView === 'home';
    homeButton.hidden = nextView === 'login';
    logoutButton.hidden = nextView === 'login';
    dashboardTotalElement.textContent = String(dashboardTotal);

    const previousView = activeView;
    activeView = nextView;
    setHistory(historyMode, nextView);
    focusHeading(nextView);

    if (nextView === 'dashboard') initializeDashboardMap();
    if (nextView === 'tracking' && previousView !== 'tracking') onEnterTracking();
    return nextView;
  };

  const navigate = requestedView => transition(requestedView, 'push');

  const handleLogin = event => {
    event.preventDefault();
    if (!authenticateDemo(usernameInput.value, passwordInput.value)) {
      loginError.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      loginError.hidden = false;
      return;
    }
    window.sessionStorage.setItem(AUTH_KEY, 'true');
    passwordInput.value = '';
    loginError.textContent = '';
    loginError.hidden = true;
    navigate('home');
  };

  const selectRegion = event => {
    const nextRegion = event.currentTarget.dataset.region;
    if (!getRegion(nextRegion)) return;
    regionId = nextRegion;
    window.sessionStorage.setItem(REGION_KEY, regionId);
    navigate('result');
  };

  const handleBack = () => {
    const previous = activeView === 'tracking' ? 'result'
      : activeView === 'result' ? 'regions'
        : 'home';
    navigate(previous);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem(AUTH_KEY);
    window.sessionStorage.removeItem(REGION_KEY);
    regionId = undefined;
    navigate('login');
  };

  const handlePopState = event => transition(event.state?.view ?? historyView(), 'replace');
  const handleVisibility = () => {
    if (document.hidden && activeView === 'tracking') onLeaveTracking();
  };
  const handlePageHide = () => {
    if (activeView === 'tracking') onLeaveTracking();
  };

  const bindEvents = () => {
    listen(loginForm, 'submit', handleLogin);
    for (const opener of document.querySelectorAll('[data-open-view]')) {
      listen(opener, 'click', event => navigate(event.currentTarget.dataset.openView));
    }
    for (const region of document.querySelectorAll('[data-region]')) listen(region, 'click', selectRegion);
    listen(provinceFilter, 'change', renderRanking);
    listen(openTracking, 'click', () => navigate('tracking'));
    listen(backButton, 'click', handleBack);
    listen(homeButton, 'click', () => navigate('home'));
    listen(logoutButton, 'click', handleLogout);
    listen(window, 'popstate', handlePopState);
    listen(document, 'visibilitychange', handleVisibility);
    listen(window, 'pagehide', handlePageHide);
  };

  const start = () => {
    if (destroyed) return activeView;
    if (!started) {
      started = true;
      const storedRegion = window.sessionStorage.getItem(REGION_KEY);
      if (getRegion(storedRegion)) regionId = storedRegion;
      else if (storedRegion !== null) window.sessionStorage.removeItem(REGION_KEY);
      renderRegionCollections();
      bindEvents();
    }
    return transition(historyView(), 'replace');
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (activeView === 'tracking') onLeaveTracking();
    while (removers.length) removers.pop()();
    dashboardMap?.remove?.();
    dashboardMap = null;
  };

  return {
    start,
    navigate,
    get currentView() { return activeView; },
    get selectedRegion() { return regionId; },
    destroy
  };
}
