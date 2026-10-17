/* ================= SpaceRent — static (GitHub Pages) demo =================
   Runs 100% in the browser. Data (plots, accounts, bookings) is stored in
   localStorage, so it persists on YOUR device only — perfect for a live demo.
   For a shared multi-user production site, deploy the server version instead. */
(function () {
  'use strict';

  /* ---------- localStorage "database" ---------- */
  const DB_KEY = 'sr_db_v1';
  const SESSION_KEY = 'sr_session_v1';

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* corrupted — reseed */ }
    const seed = window.SR_SEED || { owner: null, plots: [] };
    const db = {
      users: [seed.owner].filter(Boolean),
      plots: seed.plots || [],
      bookings: [],
    };
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  let DB = loadDB();

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  /* ---------- auth (demo: stored locally) ---------- */
  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      if (s.exp && s.exp < Date.now()) { localStorage.removeItem(SESSION_KEY); return null; }
      return DB.users.find(u => u.id === s.userId) || null;
    } catch { return null; }
  }
  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, exp: Date.now() + 30 * 864e5 }));
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  /* ---------- metadata ---------- */
  const TYPES = {
    'banquet-hall': { label: 'Banquet Hall', icon: '🍽️', grad: 'linear-gradient(135deg,#6366f1,#8b5cf6)' },
    'garden': { label: 'Garden', icon: '🌿', grad: 'linear-gradient(135deg,#10b981,#34d399)' },
    'residence': { label: 'Residence / Villa', icon: '🏡', grad: 'linear-gradient(135deg,#f59e0b,#f97316)' },
    'conference-hall': { label: 'Conference Hall', icon: '🏛️', grad: 'linear-gradient(135deg,#0ea5e9,#38bdf8)' },
    'beachfront': { label: 'Beachfront', icon: '🏖️', grad: 'linear-gradient(135deg,#06b6d4,#22d3ee)' },
    'rooftop': { label: 'Rooftop', icon: '🌆', grad: 'linear-gradient(135deg,#ec4899,#f43f5e)' },
    'farmhouse': { label: 'Farmhouse', icon: '🌾', grad: 'linear-gradient(135deg,#84cc16,#a3e635)' },
    'ballroom': { label: 'Grand Ballroom', icon: '💃', grad: 'linear-gradient(135deg,#a855f7,#d946ef)' },
    'auditorium': { label: 'Auditorium', icon: '🎬', grad: 'linear-gradient(135deg,#334155,#64748b)' },
    'wedding-mandap': { label: 'Wedding Mandap / Lawn', icon: '🪷', grad: 'linear-gradient(135deg,#e11d48,#fb7185)' },
    'studio': { label: 'Photo / Event Studio', icon: '📸', grad: 'linear-gradient(135deg,#0d9488,#2dd4bf)' },
    'hotel': { label: 'Hotel / Resort', icon: '🏨', grad: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
    'tent': { label: 'Tent / Marquee', icon: '⛺', grad: 'linear-gradient(135deg,#b45309,#f59e0b)' },
    'pavilion': { label: 'Pavilion', icon: '🏞️', grad: 'linear-gradient(135deg,#15803d,#4ade80)' },
    'clubhouse': { label: 'Clubhouse', icon: '🎉', grad: 'linear-gradient(135deg,#c026d3,#f0abfc)' },
    'other': { label: 'Other', icon: '✨', grad: 'linear-gradient(135deg,#64748b,#94a3b8)' },
  };
  const PAYMENTS = {
    card: { label: 'Card', icon: '💳' },
    upi: { label: 'UPI', icon: '📱' },
    paypal: { label: 'PayPal', icon: '🅿️' },
    'bank-transfer': { label: 'Bank Transfer', icon: '🏦' },
    cash: { label: 'Cash', icon: '💵' },
  };
  const typeMeta = t => TYPES[t] || TYPES.other;
  const payMeta = m => PAYMENTS[m] || { label: m, icon: '💳' };

  /* ---------- local API (mirrors the server) ---------- */
  const localApi = {
    listPlots(params) {
      let results = DB.plots.filter(p => p.available);
      const loc = (params.get('location') || '').trim().toLowerCase();
      const type = params.get('type') || '';
      const maxPrice = Number(params.get('maxPrice'));
      const minCapacity = Number(params.get('minCapacity'));
      if (loc) results = results.filter(p => [p.location, p.city, p.area, p.name].some(v => v.toLowerCase().includes(loc)));
      if (type) results = results.filter(p => p.type === type);
      if (maxPrice > 0) results = results.filter(p => p.pricePerDay <= maxPrice);
      if (minCapacity > 0) results = results.filter(p => p.capacity >= minCapacity);
      results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { count: results.length, plots: results };
    },
    getPlot(id) {
      const p = DB.plots.find(x => x.id === id);
      if (!p) throw new Error('plot not found');
      return { plot: p };
    },
    createPlot(body) {
      const user = getSession();
      if (!user) throw new Error('login required: only owners can add plots');
      const plot = normalizePlot(body, user);
      const errors = validatePlot(plot);
      if (errors.length) throw new Error(errors.join('; '));
      DB.plots.push(plot);
      saveDB(DB);
      return { plot };
    },
    updatePlot(id, body) {
      const user = getSession();
      if (!user) throw new Error('login required');
      const existing = DB.plots.find(p => p.id === id);
      if (!existing) throw new Error('plot not found');
      if (existing.ownerId !== user.id) throw new Error('you can only edit your own plots');
      const plot = normalizePlot({ ...existing, ...body, id, createdAt: existing.createdAt }, user);
      const errors = validatePlot(plot);
      if (errors.length) throw new Error(errors.join('; '));
      DB.plots = DB.plots.map(p => (p.id === id ? plot : p));
      saveDB(DB);
      return { plot };
    },
    deletePlot(id) {
      const user = getSession();
      if (!user) throw new Error('login required');
      const existing = DB.plots.find(p => p.id === id);
      if (!existing) throw new Error('plot not found');
      if (existing.ownerId !== user.id) throw new Error('you can only delete your own plots');
      DB.plots = DB.plots.filter(p => p.id !== id);
      saveDB(DB);
      return { ok: true, deleted: existing.name };
    },
    myPlots() {
      const user = getSession();
      if (!user) throw new Error('login required');
      const plots = DB.plots.filter(p => p.ownerId === user.id);
      return { count: plots.length, plots };
    },
    register(body) {
      const email = String(body.email || '').trim().toLowerCase();
      if (DB.users.some(u => u.email === email)) throw new Error('an account with this email already exists');
      const user = { id: uid(), name: body.name.trim(), email, password: body.password };
      DB.users.push(user);
      saveDB(DB);
      setSession(user);
      return { user: { id: user.id, name: user.name, email: user.email } };
    },
    login(body) {
      const email = String(body.email || '').trim().toLowerCase();
      const user = DB.users.find(u => u.email === email && u.password === body.password);
      if (!user) throw new Error('invalid email or password');
      setSession(user);
      return { user: { id: user.id, name: user.name, email: user.email } };
    },
    logout() { clearSession(); return { ok: true }; },
    me() {
      const user = getSession();
      if (!user) throw new Error('not authenticated');
      return { user: { id: user.id, name: user.name, email: user.email } };
    },
    createBooking(body) {
      const plot = DB.plots.find(p => p.id === body.plotId);
      if (!plot) throw new Error('plot not found');
      if (!body.name || !body.email || !body.date) throw new Error('name, email and date are required');
      const booking = {
        id: uid(), plotId: plot.id, plotName: plot.name, plotCity: plot.city,
        ownerEmail: plot.ownerEmail, customerName: body.name, customerEmail: body.email,
        customerPhone: body.phone || '', date: body.date, guests: Number(body.guests) || 0,
        paymentMethod: PAYMENTS[body.payment] ? body.payment : 'card',
        message: body.message || '', createdAt: new Date().toISOString(),
      };
      DB.bookings.push(booking);
      saveDB(DB);
      return { bookingId: booking.id, reference: 'SR-' + booking.id.slice(0, 8).toUpperCase() };
    },
    myBookings() {
      const user = getSession();
      if (!user) throw new Error('login required');
      const myPlotIds = new Set(DB.plots.filter(p => p.ownerId === user.id).map(p => p.id));
      const bookings = DB.bookings.filter(b => myPlotIds.has(b.plotId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { count: bookings.length, bookings };
    },
    resetDemo() {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(SESSION_KEY);
      DB = loadDB();
      return { ok: true };
    },
  };

  function normalizePlot(body, owner) {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    return {
      id: body.id || uid(),
      ownerId: owner.id, ownerName: owner.name, ownerEmail: owner.email,
      name: String(body.name || '').trim(),
      type: TYPES[body.type] ? body.type : 'other',
      location: String(body.location || '').trim(),
      city: String(body.city || '').trim(),
      area: String(body.area || '').trim(),
      pricePerDay: Math.max(0, Number(body.pricePerDay) || 0),
      currency: String(body.currency || 'USD') || 'USD',
      capacity: Math.max(0, Number(body.capacity) || 0),
      amenities: Array.isArray(body.amenities) ? body.amenities.map(String).slice(0, 30) : [],
      description: String(body.description || '').trim().slice(0, 2000),
      images: Array.isArray(body.images) ? body.images.map(String).slice(0, 10) : [],
      paymentMethods: Array.isArray(body.paymentMethods) ? body.paymentMethods.filter(m => PAYMENTS[m]) : [],
      lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
      lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
      available: body.available === undefined ? true : Boolean(body.available),
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  function validatePlot(p) {
    const errors = [];
    if (!p.name) errors.push('name is required');
    if (!p.location) errors.push('location is required');
    if (!p.city) errors.push('city is required');
    if (!Number.isFinite(p.pricePerDay) || p.pricePerDay <= 0) errors.push('pricePerDay must be a positive number');
    return errors;
  }

  /* ---------- frontend (same views as the server app) ---------- */
  function api(name, ...args) {
    // thin wrapper around localApi
    return localApi[name](...args);
  }

  const $app = document.getElementById('app');
  const $headerActions = document.getElementById('headerActions');
  const $modalRoot = document.getElementById('modalRoot');
  const $toastRoot = document.getElementById('toastRoot');
  const state = { user: null, plots: [], filters: { location: '', type: '', maxPrice: '', minCapacity: '' }, view: 'grid' };
  let mapInstance = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function money(n, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n);
    } catch { return (currency || 'USD') + ' ' + n; }
  }
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $toastRoot.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  }
  function initials(name) { return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function teardownMap() { if (mapInstance) { mapInstance.remove(); mapInstance = null; } }

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the map (check your internet connection)'));
      document.head.appendChild(s);
    });
  }

  function renderMap(plots, elId, fitOne) {
    const el = document.getElementById(elId);
    if (!el) return;
    const located = plots.filter(p => p.lat != null && p.lng != null);
    loadLeaflet().then(() => {
      const map = L.map(elId, { scrollWheelZoom: false }).setView([20, 0], 2);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      const markers = [];
      located.forEach(p => {
        const marker = L.marker([p.lat, p.lng]).addTo(map);
        marker.bindPopup(
          '<div class="map-pop"><strong>' + esc(p.name) + '</strong><br/>' +
          '<span style="color:#4f46e5;font-weight:700">' + money(p.pricePerDay, p.currency) + ' / day</span><br/>' +
          '<span style="color:#64748b;font-size:12px">' + esc(p.city) + ' · 👥 ' + p.capacity + '</span><br/>' +
          '<a href="#/plot/' + esc(p.id) + '" style="color:#4f46e5;font-weight:600;font-size:12px">View details →</a></div>'
        );
        markers.push(marker);
      });
      if (markers.length === 1 && fitOne) map.setView([located[0].lat, located[0].lng], 14);
      else if (markers.length >= 1) map.fitBounds(L.latLngBounds(located.map(p => [p.lat, p.lng])), { padding: [40, 40] });
      mapInstance = map;
    }).catch(e => {
      el.outerHTML = '<div class="empty"><div class="big">🗺️</div><h3>Map unavailable</h3><p>' + esc(e.message) + '</p></div>';
    });
  }

  async function refreshHeader() {
    try { state.user = (await api('me')).user; } catch { state.user = null; }
    if (state.user) {
      $headerActions.innerHTML =
        '<div class="user-chip"><span class="avatar">' + esc(initials(state.user.name)) + '</span>' +
        '<span>' + esc(state.user.name.split(' ')[0]) + '</span></div>' +
        '<button class="btn btn-outline btn-sm" id="logoutBtn">Log out</button>';
      document.getElementById('logoutBtn').onclick = () => {
        api('logout'); state.user = null; refreshHeader(); toast('Logged out');
        location.hash = '#/'; route();
      };
    } else {
      $headerActions.innerHTML =
        '<a class="btn btn-outline btn-sm" href="#/login">Log in</a>' +
        '<a class="btn btn-primary btn-sm" href="#/register">List your space</a>';
    }
    document.querySelectorAll('.main-nav a').forEach(a => {
      const h = a.getAttribute('href');
      a.classList.toggle('active',
        (h === '#/' && (location.hash === '' || location.hash === '#/')) ||
        (h === '#/owner' && location.hash.startsWith('#/owner')));
    });
  }

  function paymentBadges(p) {
    if (!p.paymentMethods || !p.paymentMethods.length) return '';
    return '<div class="pay-badges">' + p.paymentMethods.map(m => {
      const pm = payMeta(m);
      return '<span class="pay-badge" title="Accepts ' + esc(pm.label) + '">' + pm.icon + ' ' + esc(pm.label) + '</span>';
    }).join('') + '</div>';
  }

  function plotCard(p) {
    const t = typeMeta(p.type);
    const img = p.images && p.images.length ? '<img src="' + esc(p.images[0]) + '" alt="" onerror="this.remove()" />' : '';
    return (
      '<article class="plot-card" data-id="' + esc(p.id) + '">' +
        '<div class="plot-thumb" style="background:' + t.grad + '">' + img + t.icon +
          '<span class="badge">' + esc(p.city) + '</span>' +
          '<span class="badge badge-type">' + esc(t.label) + '</span>' +
        '</div>' +
        '<div class="plot-body">' +
          '<div class="plot-name">' + esc(p.name) + '</div>' +
          '<div class="plot-loc">📍 ' + esc(p.location) + (p.area ? ', ' + esc(p.area) : '') + '</div>' +
          '<div class="plot-meta"><span>👥 ' + plural(p.capacity, 'guest') + '</span>' +
          (p.lat != null ? '<span>🗺️ On map</span>' : '') + '</div>' +
          paymentBadges(p) +
          '<div class="plot-foot">' +
            '<div class="price">' + money(p.pricePerDay, p.currency) + ' <small>/ day</small></div>' +
            '<span class="owner-tag">by ' + esc(p.ownerName) + '</span>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function homeView() {
    const f = state.filters;
    $app.innerHTML =
      '<section class="hero"><div class="container">' +
        '<h1>Find the perfect space<br />for your <em>function &amp; event</em></h1>' +
        '<p class="sub">Browse banquet halls, mandaps, gardens, villas, rooftops, auditoriums and more — with transparent daily rental prices, searchable by location, and viewable on a map.</p>' +
        '<div class="demo-note">🌐 <strong>Demo mode:</strong> this static site stores your changes in this browser only. Log in as the demo owner to try adding &amp; deleting spaces. <a href="#" id="resetDemo">Reset demo data</a></div>' +
        '<div class="search-card">' +
          '<div class="search-field"><label>Location</label>' +
            '<input id="fLocation" type="text" placeholder="City, area or plot name…" value="' + esc(f.location) + '" /></div>' +
          '<div class="search-field"><label>Space type</label>' +
            '<select id="fType"><option value="">All types</option>' +
            Object.keys(TYPES).map(k => '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + TYPES[k].label + '</option>').join('') +
            '</select></div>' +
          '<div class="search-field"><label>Max price / day</label>' +
            '<input id="fPrice" type="number" min="0" placeholder="Any" value="' + esc(f.maxPrice) + '" /></div>' +
          '<div class="search-field"><label>Min guests</label>' +
            '<input id="fCap" type="number" min="0" placeholder="Any" value="' + esc(f.minCapacity) + '" /></div>' +
          '<button class="btn btn-primary" id="searchBtn">🔍 Search</button>' +
        '</div>' +
      '</div></section>' +
      '<section class="results-wrap"><div class="container">' +
        '<div class="results-head">' +
          '<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap"><h2>Available spaces</h2><span class="count" id="resultCount"></span></div>' +
          '<div class="view-toggle" role="tablist">' +
            '<button id="viewGrid" class="vt-btn' + (state.view === 'grid' ? ' active' : '') + '">▦ Grid</button>' +
            '<button id="viewMap" class="vt-btn' + (state.view === 'map' ? ' active' : '') + '">🗺️ Map</button>' +
          '</div>' +
        '</div>' +
        '<div id="resultsGrid" class="grid"></div>' +
        '<div id="mapView" style="display:' + (state.view === 'map' ? 'block' : 'none') + '"></div>' +
      '</div></section>';

    document.getElementById('resetDemo').onclick = e => {
      e.preventDefault();
      if (confirm('Reset all demo data to the original listings?')) {
        api('resetDemo'); state.user = null; refreshHeader(); renderResults(); toast('Demo data reset', 'success');
      }
    };
    document.getElementById('searchBtn').onclick = applySearch;
    ['fLocation', 'fType', 'fPrice', 'fCap'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') applySearch(); });
    });
    document.getElementById('fLocation').addEventListener('input', () => {
      clearTimeout(window.__srSearchT);
      window.__srSearchT = setTimeout(applySearch, 350);
    });
    document.getElementById('viewGrid').onclick = () => switchView('grid');
    document.getElementById('viewMap').onclick = () => switchView('map');
    renderResults();
  }

  function switchView(v) {
    state.view = v;
    teardownMap();
    const grid = document.getElementById('resultsGrid');
    const mapEl = document.getElementById('mapView');
    const bg = document.getElementById('viewGrid');
    const bm = document.getElementById('viewMap');
    if (!grid) return;
    if (v === 'map') {
      grid.style.display = 'none'; mapEl.style.display = 'block';
      bg.classList.remove('active'); bm.classList.add('active');
      mapEl.innerHTML = '<div class="map-box" id="map"></div>';
      renderMap(state.plots, 'map', false);
    } else {
      grid.style.display = ''; mapEl.style.display = 'none';
      bg.classList.add('active'); bm.classList.remove('active');
    }
  }

  function applySearch() {
    state.filters.location = document.getElementById('fLocation').value.trim();
    state.filters.type = document.getElementById('fType').value;
    state.filters.maxPrice = document.getElementById('fPrice').value;
    state.filters.minCapacity = document.getElementById('fCap').value;
    renderResults();
  }

  function renderResults() {
    const grid = document.getElementById('resultsGrid');
    const countEl = document.getElementById('resultCount');
    if (!grid) return;
    teardownMap();
    const params = new URLSearchParams(state.filters);
    const data = api('listPlots', params);
    state.plots = data.plots;
    countEl.textContent = plural(data.count, 'space') + ' available';
    if (!data.plots.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">🔭</div><h3>No spaces match your search</h3><p>Try a different location or clear a filter.</p></div>';
      if (state.view === 'map') document.getElementById('mapView').innerHTML = '<div class="empty"><div class="big">🗺️</div><p>No pinned spaces to show on the map.</p></div>';
      return;
    }
    grid.innerHTML = data.plots.map(plotCard).join('');
    grid.querySelectorAll('.plot-card').forEach(card => {
      card.onclick = () => { location.hash = '#/plot/' + card.dataset.id; };
    });
    if (state.view === 'map') {
      const mapEl = document.getElementById('mapView');
      mapEl.innerHTML = '<div class="map-box" id="map"></div>';
      renderMap(data.plots, 'map', false);
    }
  }

  function detailView(id) {
    let p;
    try { p = api('getPlot', id).plot; }
    catch {
      $app.innerHTML = '<div class="detail-wrap"><div class="container"><div class="empty"><div class="big">🫥</div><h3>Space not found</h3><p>It may have been removed by its owner.</p><p style="margin-top:14px"><a class="btn btn-primary" href="#/">Browse spaces</a></p></div></div></div>';
      return;
    }
    const t = typeMeta(p.type);
    const isOwner = state.user && state.user.id === p.ownerId;
    const img = p.images && p.images.length ? '<img src="' + esc(p.images[0]) + '" alt="" onerror="this.remove()" />' : '';
    const hasCoords = p.lat != null && p.lng != null;

    $app.innerHTML =
      '<div class="detail-wrap"><div class="container">' +
        '<a class="back-link" href="#/">← Back to all spaces</a>' +
        '<div class="detail-card">' +
          '<div class="detail-hero" style="background:' + t.grad + '">' + img + t.icon + '</div>' +
          '<div class="detail-content">' +
            '<div class="detail-top">' +
              '<div><h1>' + esc(p.name) + '</h1>' +
                '<div class="detail-loc">📍 ' + esc(p.location) + (p.area ? ', ' + esc(p.area) : '') + ', ' + esc(p.city) + '</div></div>' +
              '<div class="detail-price-box"><div class="price">' + money(p.pricePerDay, p.currency) + ' <small>/ day</small></div>' +
                '<div class="muted">' + esc(t.label) + '</div></div>' +
            '</div>' +
            '<div class="detail-stats">' +
              '<div class="stat"><div class="k">Capacity</div><div class="v">👥 ' + plural(p.capacity, 'guest') + '</div></div>' +
              '<div class="stat"><div class="k">Type</div><div class="v">' + esc(t.label) + '</div></div>' +
              '<div class="stat"><div class="k">Location</div><div class="v">' + esc(p.city) + '</div></div>' +
              '<div class="stat"><div class="k">Payment</div><div class="v" style="font-size:.95rem">' +
                (p.paymentMethods && p.paymentMethods.length ? p.paymentMethods.map(m => payMeta(m).icon + ' ' + payMeta(m).label).join(' · ') : 'On request') +
              '</div></div>' +
            '</div>' +
            (p.amenities && p.amenities.length ? '<div class="muted" style="font-weight:700;font-size:.8rem;text-transform:uppercase;letter-spacing:.06em">Amenities</div><div class="amenities">' +
              p.amenities.map(a => '<span class="amenity">' + esc(a) + '</span>').join('') + '</div>' : '') +
            (p.description ? '<p class="detail-desc">' + esc(p.description) + '</p>' : '') +
            (hasCoords ? '<div id="detailMap" class="map-box" style="height:260px;margin-bottom:24px"></div>' : '') +
            '<div class="contact-box">' +
              '<div><div class="who">Owned by ' + esc(p.ownerName) + '</div>' +
                '<div class="mail">📧 ' + esc(p.ownerEmail) + '</div></div>' +
              '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
                '<button class="btn btn-primary" id="bookBtn">📅 Book this space</button>' +
                '<a class="btn btn-outline" href="mailto:' + esc(p.ownerEmail) + '?subject=' +
                  encodeURIComponent('Enquiry: ' + p.name) + '">Contact owner</a>' +
              '</div>' +
            '</div>' +
            (isOwner ? '<div class="detail-actions">' +
              '<button class="btn btn-outline" id="editBtn">✏️ Edit this space</button>' +
              '<button class="btn btn-danger" id="delBtn">🗑 Remove from site</button>' +
            '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div></div>';

    if (hasCoords) {
      loadLeaflet().then(() => {
        const map = L.map('detailMap', { scrollWheelZoom: false }).setView([p.lat, p.lng], 14);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
        L.marker([p.lat, p.lng]).addTo(map).bindPopup('<strong>' + esc(p.name) + '</strong>').openPopup();
        mapInstance = map;
      }).catch(() => { const el = document.getElementById('detailMap'); if (el) el.remove(); });
    }
    document.getElementById('bookBtn').onclick = () => openBookingForm(p);
    if (isOwner) {
      document.getElementById('editBtn').onclick = () => openPlotForm(p);
      document.getElementById('delBtn').onclick = () => confirmDelete(p);
    }
  }

  function openBookingForm(p) {
    const methods = (p.paymentMethods && p.paymentMethods.length) ? p.paymentMethods : Object.keys(PAYMENTS);
    const today = new Date().toISOString().slice(0, 10);
    $modalRoot.innerHTML =
      '<div class="modal-overlay" id="ovl">' +
        '<div class="modal">' +
          '<div class="modal-head"><h2>Book ' + esc(p.name) + '</h2><button class="modal-close" id="mClose">✕</button></div>' +
          '<div class="modal-body">' +
            '<div id="formMsg"></div>' +
            '<div style="background:var(--brand-soft);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:18px;font-size:.92rem">' +
              '<strong>' + money(p.pricePerDay, p.currency) + ' / day</strong> · 👥 ' + plural(p.capacity, 'guest') + ' · 📍 ' + esc(p.city) +
            '</div>' +
            '<form id="bookForm">' +
              '<div class="form-row">' +
                '<div class="field"><label>Your name *</label><input name="name" required placeholder="Full name" /></div>' +
                '<div class="field"><label>Email *</label><input name="email" type="email" required placeholder="you@example.com" /></div>' +
              '</div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Phone</label><input name="phone" placeholder="+91 98765 43210" /></div>' +
                '<div class="field"><label>Event date *</label><input name="date" type="date" required min="' + today + '" /></div>' +
              '</div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Expected guests</label><input name="guests" type="number" min="1" placeholder="e.g. 250" /></div>' +
                '<div class="field"><label>Payment method</label><select name="payment">' +
                  methods.map(m => '<option value="' + m + '">' + payMeta(m).icon + ' ' + payMeta(m).label + '</option>').join('') +
                '</select></div>' +
              '</div>' +
              '<div class="field"><label>Message to the owner</label><textarea name="message" placeholder="Tell the owner about your event…"></textarea></div>' +
            '</form>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button class="btn btn-ghost" id="mCancel">Cancel</button>' +
            '<button class="btn btn-primary" id="mSend">Send booking request</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    const close = () => { $modalRoot.innerHTML = ''; };
    document.getElementById('mClose').onclick = close;
    document.getElementById('mCancel').onclick = close;
    document.getElementById('ovl').onclick = e => { if (e.target.id === 'ovl') close(); };
    document.getElementById('mSend').onclick = () => {
      const fd = new FormData(document.getElementById('bookForm'));
      const body = Object.fromEntries(fd.entries());
      body.plotId = p.id;
      const msg = document.getElementById('formMsg');
      try {
        const data = api('createBooking', body);
        $modalRoot.innerHTML =
          '<div class="modal-overlay" id="ovl">' +
            '<div class="modal" style="max-width:480px;text-align:center;padding:40px 32px">' +
              '<div style="font-size:3.4rem">✅</div>' +
              '<h2 style="margin:14px 0 8px">Booking request sent!</h2>' +
              '<p style="color:var(--ink-2)">Reference: <strong>' + esc(data.reference) + '</strong></p>' +
              '<p style="color:var(--ink-2);margin-top:8px">' + esc(p.ownerName) + ' will confirm availability for ' + esc(body.date) + '. (Demo: stored in this browser.)</p>' +
              '<button class="btn btn-primary" style="margin-top:22px" id="mDone">Done</button>' +
            '</div>' +
          '</div>';
        document.getElementById('mDone').onclick = close;
        document.getElementById('ovl').onclick = e => { if (e.target.id === 'ovl') close(); };
      } catch (err) {
        msg.innerHTML = '<div class="form-error">' + esc(err.message) + '</div>';
      }
    };
  }

  function authView(mode) {
    const isLogin = mode === 'login';
    $app.innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
        '<h1>' + (isLogin ? 'Welcome back 👋' : 'List your space 🏡') + '</h1>' +
        '<p class="sub">' + (isLogin ? 'Log in to manage your rental plots.' : 'Create an owner account to add and manage your spaces.') + '</p>' +
        (isLogin ? '<div class="demo-login-hint">Demo owner: <strong>owner@spacerent.demo</strong> / <strong>demo1234</strong></div>' : '') +
        '<div id="formMsg"></div>' +
        '<form id="authForm">' +
          (isLogin ? '' : '<div class="field"><label>Full name</label><input name="name" required placeholder="e.g. Priya Sharma" /></div>') +
          '<div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com" /></div>' +
          '<div class="field"><label>Password</label><input name="password" type="password" required minlength="6" placeholder="At least 6 characters" /></div>' +
          '<button class="btn btn-primary" style="width:100%" type="submit">' + (isLogin ? 'Log in' : 'Create account') + '</button>' +
        '</form>' +
        '<div class="auth-switch">' +
          (isLogin ? 'New owner? <a id="switchLink">Create an account</a>' : 'Already have an account? <a id="switchLink">Log in</a>') +
        '</div>' +
      '</div></div>';
    document.getElementById('switchLink').onclick = () => { location.hash = isLogin ? '#/register' : '#/login'; };
    document.getElementById('authForm').onsubmit = e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      const msg = document.getElementById('formMsg');
      try {
        const data = api(isLogin ? 'login' : 'register', body);
        state.user = data.user;
        refreshHeader();
        toast(isLogin ? 'Welcome back, ' + data.user.name.split(' ')[0] + '!' : 'Account created — you can now list spaces!', 'success');
        location.hash = '#/owner';
        route();
      } catch (err) {
        msg.innerHTML = '<div class="form-error">' + esc(err.message) + '</div>';
      }
    };
  }

  function ownerView() {
    if (!state.user) { location.hash = '#/login'; return; }
    let data;
    try { data = api('myPlots'); }
    catch (e) {
      $app.innerHTML = '<div class="dash-wrap"><div class="container"><div class="empty"><div class="big">⚠️</div><h3>Could not load your spaces</h3><p>' + esc(e.message) + '</p></div></div></div>';
      return;
    }
    const plots = data.plots;
    const available = plots.filter(p => p.available).length;
    const totalValue = plots.reduce((s, p) => s + p.pricePerDay, 0);

    $app.innerHTML =
      '<div class="dash-wrap"><div class="container">' +
        '<div class="dash-head">' +
          '<div><h1>Owner dashboard</h1><div class="sub">Manage the spaces you list for rent on SpaceRent.</div></div>' +
          '<button class="btn btn-primary" id="addPlotBtn">＋ Add new plot</button>' +
        '</div>' +
        '<div class="dash-stats">' +
          '<div class="dash-stat"><div class="k">Total spaces</div><div class="v">' + plots.length + '</div></div>' +
          '<div class="dash-stat"><div class="k">Currently for rent</div><div class="v">' + available + '</div></div>' +
          '<div class="dash-stat"><div class="k">Daily value (all spaces)</div><div class="v">' + money(totalValue, 'USD') + ' <small>/ day</small></div></div>' +
          '<div class="dash-stat"><div class="k">Booking requests</div><div class="v" id="bookingCount">…</div></div>' +
        '</div>' +
        (plots.length
          ? '<div class="table-wrap"><table class="owner-table"><thead><tr>' +
            '<th>Space</th><th>Location</th><th>Price / day</th><th>Payment</th><th>Status</th><th>Actions</th>' +
            '</tr></thead><tbody>' +
            plots.map(p =>
              '<tr>' +
                '<td class="name-cell"><a href="#/plot/' + esc(p.id) + '">' + esc(p.name) + '</a></td>' +
                '<td>' + esc(p.city) + (p.area ? ' · ' + esc(p.area) : '') + '</td>' +
                '<td><strong>' + money(p.pricePerDay, p.currency) + '</strong></td>' +
                '<td>' + (p.paymentMethods && p.paymentMethods.length ? p.paymentMethods.map(m => payMeta(m).icon).join(' ') : '<span class="muted">—</span>') + '</td>' +
                '<td><span class="status-pill ' + (p.available ? 'status-on' : 'status-off') + '">' + (p.available ? 'For rent' : 'Not for rent') + '</span></td>' +
                '<td><div class="row-actions">' +
                  '<button class="btn btn-outline btn-sm" data-edit="' + esc(p.id) + '">Edit</button>' +
                  '<button class="btn btn-danger btn-sm" data-del="' + esc(p.id) + '">Delete</button>' +
                '</div></td>' +
              '</tr>').join('') +
            '</tbody></table></div>'
          : '<div class="empty"><div class="big">🏗️</div><h3>You haven\'t listed any spaces yet</h3>' +
            '<p>Add your first plot and it will appear on the site instantly.</p>' +
            '<p style="margin-top:16px"><button class="btn btn-primary" id="addPlotBtn2">＋ Add your first plot</button></p></div>') +
        '<div id="bookingsSection" style="margin-top:36px"></div>' +
      '</div></div>';

    const openAdd = () => openPlotForm(null);
    document.getElementById('addPlotBtn').onclick = openAdd;
    const add2 = document.getElementById('addPlotBtn2');
    if (add2) add2.onclick = openAdd;
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openPlotForm(plots.find(p => p.id === b.dataset.edit)));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmDelete(plots.find(p => p.id === b.dataset.del)));
    loadBookings();
  }

  function loadBookings() {
    const section = document.getElementById('bookingsSection');
    if (!section) return;
    let data;
    try { data = api('myBookings'); } catch { section.innerHTML = ''; return; }
    document.getElementById('bookingCount').textContent = data.count;
    if (!data.bookings.length) {
      section.innerHTML = '<h2 style="font-size:1.25rem;font-weight:800;margin-bottom:14px">Booking requests</h2>' +
        '<div class="empty"><div class="big">📭</div><p>No booking requests yet. When someone books one of your spaces, their request will appear here.</p></div>';
      return;
    }
    section.innerHTML = '<h2 style="font-size:1.25rem;font-weight:800;margin-bottom:14px">Booking requests</h2>' +
      '<div class="table-wrap"><table class="owner-table"><thead><tr>' +
      '<th>Space</th><th>Customer</th><th>Date</th><th>Guests</th><th>Payment</th><th>Message</th><th>When</th>' +
      '</tr></thead><tbody>' +
      data.bookings.map(b =>
        '<tr>' +
          '<td class="name-cell">' + esc(b.plotName) + '</td>' +
          '<td>' + esc(b.customerName) + '<br/><span class="muted">' + esc(b.customerEmail) + (b.customerPhone ? ' · ' + esc(b.customerPhone) : '') + '</span></td>' +
          '<td><strong>' + esc(b.date) + '</strong></td>' +
          '<td>' + (b.guests || '—') + '</td>' +
          '<td>' + payMeta(b.paymentMethod).icon + ' ' + esc(payMeta(b.paymentMethod).label) + '</td>' +
          '<td style="max-width:220px">' + (b.message ? esc(b.message) : '<span class="muted">—</span>') + '</td>' +
          '<td class="muted">' + esc(b.createdAt.slice(0, 10)) + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div>';
  }

  function openPlotForm(plot) {
    const isEdit = !!plot;
    const p = plot || { name: '', type: 'banquet-hall', location: '', city: '', area: '', pricePerDay: '', currency: 'USD', capacity: '', amenities: [], description: '', images: [], available: true, paymentMethods: [], lat: '', lng: '' };
    const amenityOptions = ['Parking', 'Catering', 'Stage', 'Sound system', 'Lighting', 'Air conditioning', 'Generator backup', 'Wedding decor', 'Kitchen', 'Accommodation', 'Wi-Fi', 'Security'];

    $modalRoot.innerHTML =
      '<div class="modal-overlay" id="ovl">' +
        '<div class="modal">' +
          '<div class="modal-head"><h2>' + (isEdit ? 'Edit space' : 'Add a new plot') + '</h2>' +
            '<button class="modal-close" id="mClose">✕</button></div>' +
          '<div class="modal-body">' +
            '<div id="formMsg"></div>' +
            '<form id="plotForm">' +
              '<div class="field"><label>Space name *</label><input name="name" required placeholder="e.g. Grand Rose Banquet Hall" value="' + esc(p.name) + '" /></div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Type</label><select name="type">' +
                  Object.keys(TYPES).map(k => '<option value="' + k + '"' + (p.type === k ? ' selected' : '') + '>' + TYPES[k].label + '</option>').join('') +
                '</select></div>' +
                '<div class="field"><label>Rent per day (number) *</label><input name="pricePerDay" type="number" min="1" required placeholder="e.g. 2500" value="' + esc(p.pricePerDay) + '" /></div>' +
              '</div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Currency</label><select name="currency">' +
                  ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD'].map(c => '<option' + (p.currency === c ? ' selected' : '') + '>' + c + '</option>').join('') +
                '</select></div>' +
                '<div class="field"><label>Capacity (guests)</label><input name="capacity" type="number" min="0" placeholder="e.g. 300" value="' + esc(p.capacity) + '" /></div>' +
              '</div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Location / landmark *</label><input name="location" required placeholder="e.g. Near Central Park" value="' + esc(p.location) + '" /></div>' +
                '<div class="field"><label>City *</label><input name="city" required placeholder="e.g. Austin" value="' + esc(p.city) + '" /></div>' +
              '</div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Area / neighbourhood</label><input name="area" placeholder="e.g. Downtown" value="' + esc(p.area) + '" /></div>' +
                '<div class="field"><label>Image URL (optional)</label><input name="imageUrl" placeholder="https://…" value="' + esc((p.images && p.images[0]) || '') + '" /></div>' +
              '</div>' +
              '<div class="form-row">' +
                '<div class="field"><label>Map latitude (optional)</label><input name="lat" type="number" step="any" placeholder="e.g. 12.9716" value="' + esc(p.lat == null ? '' : p.lat) + '" /><div class="hint">Pin the space on the map.</div></div>' +
                '<div class="field"><label>Map longitude (optional)</label><input name="lng" type="number" step="any" placeholder="e.g. 77.5946" value="' + esc(p.lng == null ? '' : p.lng) + '" /><div class="hint">Get these from OpenStreetMap → share → coordinates.</div></div>' +
              '</div>' +
              '<div class="field"><label>Payment methods accepted</label><div class="pay-checks">' +
                Object.keys(PAYMENTS).map(m =>
                  '<label class="pay-check"><input type="checkbox" name="pm_' + m + '"' +
                  ((p.paymentMethods || []).includes(m) ? ' checked' : '') + ' /> ' + payMeta(m).icon + ' ' + payMeta(m).label + '</label>').join('') +
              '</div></div>' +
              '<div class="field"><label>Amenities (comma separated)</label><input name="amenities" placeholder="Parking, Catering, Stage…" value="' + esc((p.amenities || []).join(', ')) + '" /><div class="hint">Common: ' + amenityOptions.join(', ') + '</div></div>' +
              '<div class="field"><label>Description</label><textarea name="description" placeholder="Describe the space, what makes it great for events…">' + esc(p.description) + '</textarea></div>' +
              '<div class="field"><label class="checkbox-row"><input type="checkbox" name="available"' + (p.available ? ' checked' : '') + ' /> Available for rent right now</label></div>' +
            '</form>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button class="btn btn-ghost" id="mCancel">Cancel</button>' +
            '<button class="btn btn-primary" id="mSave">' + (isEdit ? 'Save changes' : 'Publish space') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    const close = () => { $modalRoot.innerHTML = ''; };
    document.getElementById('mClose').onclick = close;
    document.getElementById('mCancel').onclick = close;
    document.getElementById('ovl').onclick = e => { if (e.target.id === 'ovl') close(); };

    document.getElementById('mSave').onclick = () => {
      const fd = new FormData(document.getElementById('plotForm'));
      const paymentMethods = Object.keys(PAYMENTS).filter(m => fd.get('pm_' + m));
      const latRaw = fd.get('lat');
      const lngRaw = fd.get('lng');
      const body = {
        name: fd.get('name').trim(), type: fd.get('type'),
        pricePerDay: Number(fd.get('pricePerDay')), currency: fd.get('currency'),
        capacity: Number(fd.get('capacity') || 0),
        location: fd.get('location').trim(), city: fd.get('city').trim(), area: fd.get('area').trim(),
        imageUrl: fd.get('imageUrl').trim(),
        lat: latRaw === '' ? null : Number(latRaw),
        lng: lngRaw === '' ? null : Number(lngRaw),
        paymentMethods,
        amenities: String(fd.get('amenities') || '').split(',').map(s => s.trim()).filter(Boolean),
        description: fd.get('description').trim(),
        available: !!fd.get('available'),
      };
      if (body.imageUrl) body.images = [body.imageUrl]; else if (isEdit) body.images = p.images || [];
      const msg = document.getElementById('formMsg');
      try {
        if (isEdit) { api('updatePlot', p.id, body); toast('Space updated — the site is live with your changes.', 'success'); }
        else { api('createPlot', body); toast('Your space is now live on SpaceRent!', 'success'); }
        close();
        if (location.hash.startsWith('#/owner')) ownerView();
        else if (location.hash.startsWith('#/plot/')) detailView(p.id);
        else renderResults();
      } catch (err) {
        msg.innerHTML = '<div class="form-error">' + esc(err.message) + '</div>';
      }
    };
  }

  function confirmDelete(plot) {
    $modalRoot.innerHTML =
      '<div class="modal-overlay" id="ovl">' +
        '<div class="modal" style="max-width:460px">' +
          '<div class="modal-head"><h2>Remove this space?</h2><button class="modal-close" id="mClose">✕</button></div>' +
          '<div class="modal-body">' +
            '<p style="color:var(--ink-2)">“<strong>' + esc(plot.name) + '</strong>” will be removed from the site immediately. You can always add it back later.</p>' +
          '</div>' +
          '<div class="modal-foot">' +
            '<button class="btn btn-ghost" id="mCancel">Keep it</button>' +
            '<button class="btn btn-danger" id="mDelete">Yes, delete it</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    const close = () => { $modalRoot.innerHTML = ''; };
    document.getElementById('mClose').onclick = close;
    document.getElementById('mCancel').onclick = close;
    document.getElementById('ovl').onclick = e => { if (e.target.id === 'ovl') close(); };
    document.getElementById('mDelete').onclick = () => {
      try {
        api('deletePlot', plot.id);
        toast('“' + plot.name + '” was removed from the site.', 'success');
        close();
        if (location.hash.startsWith('#/owner')) ownerView();
        else if (location.hash.startsWith('#/plot/')) { location.hash = '#/'; route(); }
        else renderResults();
      } catch (err) {
        toast('Could not delete: ' + err.message, 'error');
      }
    };
  }

  /* ---------- router ---------- */
  function route() {
    teardownMap();
    const hash = location.hash || '#/';
    const plotMatch = hash.match(/^#\/plot\/(.+)$/);
    if (plotMatch) return detailView(decodeURIComponent(plotMatch[1]));
    switch (hash) {
      case '#/login': return authView('login');
      case '#/register': return authView('register');
      case '#/owner': return ownerView();
      case '#/':
      case '':
      default:
        return homeView();
    }
  }

  window.addEventListener('hashchange', route);
  document.getElementById('year').textContent = new Date().getFullYear();
  refreshHeader().then(route);
})();