/* ================= SpaceRent frontend ================= */
(function () {
  'use strict';

  /* ---------- API client ---------- */
  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return data;
  }

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

  /* ---------- state ---------- */
  const state = {
    user: null,
    plots: [],
    filters: { location: '', type: '', maxPrice: '', minCapacity: '' },
    view: 'grid',
  };

  const $app = document.getElementById('app');
  const $headerActions = document.getElementById('headerActions');
  const $modalRoot = document.getElementById('modalRoot');
  const $toastRoot = document.getElementById('toastRoot');
  let mapInstance = null;
  let mapMarkers = null;

  /* ---------- utilities ---------- */
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
  function initials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function teardownMap() {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarkers = null; }
  }

  /* ---------- Leaflet (lazy load) ---------- */
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

  function renderMap(plots) {
    const el = document.getElementById('mapView');
    if (!el) return;
    const located = plots.filter(p => p.lat != null && p.lng != null);
    const noCoords = plots.length - located.length;
    el.innerHTML =
      '<div id="map" class="map-box"></div>' +
      (noCoords ? '<p class="muted" style="margin-top:10px">📍 ' + noCoords + ' listing' + (noCoords === 1 ? ' has' : 's have') + ' no map pin yet.</p>' : '');
    loadLeaflet().then(() => {
      const map = L.map('map', { scrollWheelZoom: false }).setView([20, 0], 2);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      const markers = [];
      located.forEach(p => {
        const t = typeMeta(p.type);
        const marker = L.marker([p.lat, p.lng]).addTo(map);
        marker.bindPopup(
          '<div class="map-pop"><strong>' + esc(p.name) + '</strong><br/>' +
          '<span style="color:#4f46e5;font-weight:700">' + money(p.pricePerDay, p.currency) + ' / day</span><br/>' +
          '<span style="color:#64748b;font-size:12px">' + esc(p.city) + ' · 👥 ' + p.capacity + '</span><br/>' +
          '<a href="#/plot/' + esc(p.id) + '" style="color:#4f46e5;font-weight:600;font-size:12px">View details →</a></div>'
        );
        markers.push(marker);
      });
      if (markers.length === 1) {
        map.setView([located[0].lat, located[0].lng], 13);
      } else if (markers.length > 1) {
        map.fitBounds(L.latLngBounds(located.map(p => [p.lat, p.lng])), { padding: [40, 40] });
      }
      mapInstance = map;
      mapMarkers = markers;
    }).catch(e => {
      el.innerHTML = '<div class="empty"><div class="big">🗺️</div><h3>Map unavailable</h3><p>' + esc(e.message) + '</p></div>';
    });
  }

  /* ---------- header ---------- */
  async function refreshHeader() {
    try {
      const me = await api('/auth/me');
      state.user = me.user;
    } catch { state.user = null; }
    if (state.user) {
      $headerActions.innerHTML =
        '<div class="user-chip"><span class="avatar">' + esc(initials(state.user.name)) + '</span>' +
        '<span>' + esc(state.user.name.split(' ')[0]) + '</span></div>' +
        '<button class="btn btn-outline btn-sm" id="logoutBtn">Log out</button>';
      document.getElementById('logoutBtn').onclick = async () => {
        await api('/auth/logout', { method: 'POST' });
        state.user = null;
        refreshHeader();
        toast('Logged out');
        location.hash = '#/';
        route();
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

  /* ---------- payment badges ---------- */
  function paymentBadges(p) {
    if (!p.paymentMethods || !p.paymentMethods.length) return '';
    return '<div class="pay-badges">' + p.paymentMethods.map(m => {
      const pm = payMeta(m);
      return '<span class="pay-badge" title="Accepts ' + esc(pm.label) + '">' + pm.icon + ' ' + esc(pm.label) + '</span>';
    }).join('') + '</div>';
  }

  /* ---------- plot card ---------- */
  function plotCard(p) {
    const t = typeMeta(p.type);
    const img = p.images && p.images.length
      ? '<img src="' + esc(p.images[0]) + '" alt="" onerror="this.remove()" />' : '';
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

  /* ---------- home / browse view ---------- */
  function homeView() {
    const f = state.filters;
    $app.innerHTML =
      '<section class="hero"><div class="container">' +
        '<h1>Find the perfect space<br />for your <em>function &amp; event</em></h1>' +
        '<p class="sub">Browse banquet halls, mandaps, gardens, villas, rooftops, auditoriums and more — with transparent daily rental prices, searchable by location, and viewable on a map.</p>' +
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

    document.getElementById('searchBtn').onclick = applySearch;
    ['fLocation', 'fType', 'fPrice', 'fCap'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') applySearch(); });
    });
    document.getElementById('fLocation').addEventListener('input', e => {
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
      grid.style.display = 'none';
      mapEl.style.display = 'block';
      bg.classList.remove('active'); bm.classList.add('active');
      renderMap(state.plots);
    } else {
      grid.style.display = '';
      mapEl.style.display = 'none';
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

  async function renderResults() {
    const grid = document.getElementById('resultsGrid');
    const countEl = document.getElementById('resultCount');
    if (!grid) return;
    teardownMap();
    grid.innerHTML = '<div class="splash"><div class="spinner"></div></div>';
    const params = new URLSearchParams();
    if (state.filters.location) params.set('location', state.filters.location);
    if (state.filters.type) params.set('type', state.filters.type);
    if (state.filters.maxPrice) params.set('maxPrice', state.filters.maxPrice);
    if (state.filters.minCapacity) params.set('minCapacity', state.filters.minCapacity);
    try {
      const data = await api('/plots?' + params.toString());
      state.plots = data.plots;
      countEl.textContent = plural(data.count, 'space') + ' available';
      if (!data.plots.length) {
        grid.innerHTML =
          '<div class="empty" style="grid-column:1/-1"><div class="big">🔭</div>' +
          '<h3>No spaces match your search</h3><p>Try a different location or clear a filter.</p></div>';
        if (state.view === 'map') document.getElementById('mapView').innerHTML =
          '<div class="empty"><div class="big">🗺️</div><p>No pinned spaces to show on the map.</p></div>';
        return;
      }
      grid.innerHTML = data.plots.map(plotCard).join('');
      grid.querySelectorAll('.plot-card').forEach(card => {
        card.onclick = () => { location.hash = '#/plot/' + card.dataset.id; };
      });
      if (state.view === 'map') renderMap(data.plots);
    } catch (e) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">⚠️</div><h3>Could not load spaces</h3><p>' + esc(e.message) + '</p></div>';
    }
  }

  /* ---------- detail view ---------- */
  async function detailView(id) {
    $app.innerHTML = '<div class="splash"><div class="spinner"></div></div>';
    let p;
    try {
      p = (await api('/plots/' + encodeURIComponent(id))).plot;
    } catch (e) {
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
            (hasCoords ? '<div class="stat" style="margin-bottom:20px"><div class="k">On the map</div><div class="v" style="font-size:.95rem">🗺️ ' + p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) + '</div></div>' : '') +
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
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© OpenStreetMap contributors',
        }).addTo(map);
        L.marker([p.lat, p.lng]).addTo(map).bindPopup('<strong>' + esc(p.name) + '</strong>').openPopup();
      }).catch(() => {
        const el = document.getElementById('detailMap');
        if (el) el.remove();
      });
    }
    document.getElementById('bookBtn').onclick = () => openBookingForm(p);
    if (isOwner) {
      document.getElementById('editBtn').onclick = () => openPlotForm(p);
      document.getElementById('delBtn').onclick = () => confirmDelete(p);
    }
  }

  /* ---------- booking modal ---------- */
  function openBookingForm(p) {
    const methods = (p.paymentMethods && p.paymentMethods.length) ? p.paymentMethods : Object.keys(PAYMENTS);
    const today = new Date().toISOString().slice(0, 10);
    $modalRoot.innerHTML =
      '<div class="modal-overlay" id="ovl">' +
        '<div class="modal">' +
          '<div class="modal-head"><h2>Book ' + esc(p.name) + '</h2><button class="modal-close" id="mClose">✕</button></div>' +
          '<div class="modal-body">' +
            '<div id="formMsg"></div>' +
            '<div class="booking-summary" style="background:var(--brand-soft);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:18px;font-size:.92rem">' +
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
    document.getElementById('mSend').onclick = async () => {
      const fd = new FormData(document.getElementById('bookForm'));
      const body = Object.fromEntries(fd.entries());
      body.plotId = p.id;
      const msg = document.getElementById('formMsg');
      try {
        const data = await api('/bookings', { method: 'POST', body });
        $modalRoot.innerHTML =
          '<div class="modal-overlay" id="ovl">' +
            '<div class="modal" style="max-width:480px;text-align:center;padding:40px 32px">' +
              '<div style="font-size:3.4rem">✅</div>' +
              '<h2 style="margin:14px 0 8px">Booking request sent!</h2>' +
              '<p style="color:var(--ink-2)">Reference: <strong>' + esc(data.reference) + '</strong></p>' +
              '<p style="color:var(--ink-2);margin-top:8px">' + esc(p.ownerName) + ' will get your request and confirm availability for ' +
                esc(body.date) + '. You\'ll hear from them at ' + esc(body.email) + '.</p>' +
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

  /* ---------- auth views ---------- */
  function authView(mode) {
    const isLogin = mode === 'login';
    $app.innerHTML =
      '<div class="auth-wrap"><div class="auth-card">' +
        '<h1>' + (isLogin ? 'Welcome back 👋' : 'List your space 🏡') + '</h1>' +
        '<p class="sub">' + (isLogin ? 'Log in to manage your rental plots.' : 'Create an owner account to add and manage your spaces.') + '</p>' +
        '<div id="formMsg"></div>' +
        '<form id="authForm">' +
          (isLogin ? '' : '<div class="field"><label>Full name</label><input name="name" required placeholder="e.g. Priya Sharma" /></div>') +
          '<div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com" /></div>' +
          '<div class="field"><label>Password</label><input name="password" type="password" required minlength="6" placeholder="At least 6 characters" /></div>' +
          '<button class="btn btn-primary" style="width:100%" type="submit">' + (isLogin ? 'Log in' : 'Create account') + '</button>' +
        '</form>' +
        '<div class="auth-switch">' +
          (isLogin
            ? 'New owner? <a id="switchLink">Create an account</a>'
            : 'Already have an account? <a id="switchLink">Log in</a>') +
        '</div>' +
      '</div></div>';

    document.getElementById('switchLink').onclick = () => { location.hash = isLogin ? '#/register' : '#/login'; };
    document.getElementById('authForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      const msg = document.getElementById('formMsg');
      try {
        const data = await api('/auth/' + (isLogin ? 'login' : 'register'), { method: 'POST', body });
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

  /* ---------- owner dashboard ---------- */
  async function ownerView() {
    if (!state.user) { location.hash = '#/login'; return; }
    $app.innerHTML = '<div class="splash"><div class="spinner"></div></div>';
    let data;
    try {
      data = await api('/owner/plots');
    } catch (e) {
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
                '<td>' + (p.paymentMethods && p.paymentMethods.length
                  ? p.paymentMethods.map(m => payMeta(m).icon).join(' ')
                  : '<span class="muted">—</span>') + '</td>' +
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

  async function loadBookings() {
    const section = document.getElementById('bookingsSection');
    if (!section) return;
    section.innerHTML = '<div class="splash" style="padding:32px"><div class="spinner"></div></div>';
    try {
      const data = await api('/owner/bookings');
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
    } catch (e) {
      section.innerHTML = '';
    }
  }

  /* ---------- plot form modal (add / edit) ---------- */
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
                '<div class="field"><label>Map longitude (optional)</label><input name="lng" type="number" step="any" placeholder="e.g. 77.5946" value="' + esc(p.lng == null ? '' : p.lng) + '" /><div class="hint">Click on OpenStreetMap → share → copy coordinates.</div></div>' +
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

    document.getElementById('mSave').onclick = async () => {
      const fd = new FormData(document.getElementById('plotForm'));
      const paymentMethods = Object.keys(PAYMENTS).filter(m => fd.get('pm_' + m));
      const latRaw = fd.get('lat');
      const lngRaw = fd.get('lng');
      const body = {
        name: fd.get('name').trim(),
        type: fd.get('type'),
        pricePerDay: Number(fd.get('pricePerDay')),
        currency: fd.get('currency'),
        capacity: Number(fd.get('capacity') || 0),
        location: fd.get('location').trim(),
        city: fd.get('city').trim(),
        area: fd.get('area').trim(),
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
        if (isEdit) {
          await api('/plots/' + p.id, { method: 'PUT', body });
          toast('Space updated — the site is live with your changes.', 'success');
        } else {
          await api('/plots', { method: 'POST', body });
          toast('Your space is now live on SpaceRent!', 'success');
        }
        close();
        if (location.hash.startsWith('#/owner')) { ownerView(); }
        else if (location.hash.startsWith('#/plot/')) { detailView(p.id); }
        else { renderResults(); }
      } catch (err) {
        msg.innerHTML = '<div class="form-error">' + esc(err.message) + '</div>';
      }
    };
  }

  /* ---------- delete confirmation ---------- */
  function confirmDelete(plot) {
    $modalRoot.innerHTML =
      '<div class="modal-overlay" id="ovl">' +
        '<div class="modal" style="max-width:460px">' +
          '<div class="modal-head"><h2>Remove this space?</h2><button class="modal-close" id="mClose">✕</button></div>' +
          '<div class="modal-body">' +
            '<p style="color:var(--ink-2)">“<strong>' + esc(plot.name) + '</strong>” will be removed from the site immediately. ' +
            'Anyone searching will no longer see it. You can always add it back later.</p>' +
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
    document.getElementById('mDelete').onclick = async () => {
      try {
        await api('/plots/' + plot.id, { method: 'DELETE' });
        toast('“' + plot.name + '” was removed from the site.', 'success');
        close();
        if (location.hash.startsWith('#/owner')) { ownerView(); }
        else if (location.hash.startsWith('#/plot/')) { location.hash = '#/'; route(); }
        else { renderResults(); }
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