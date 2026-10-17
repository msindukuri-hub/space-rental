/**
 * SpaceRent — online space-rental system for functions & events.
 * Zero-dependency Node.js server: serves the static frontend and a JSON API.
 *
 * API:
 *   GET    /api/plots?location=&type=&maxPrice=&minCapacity=&q=
 *   GET    /api/plots/:id
 *   POST   /api/auth/register      { name, email, password }
 *   POST   /api/auth/login         { email, password }
 *   POST   /api/auth/logout
 *   POST   /api/plots              (owner) create plot
 *   PUT    /api/plots/:id          (owner) update plot
 *   DELETE /api/plots/:id          (owner) remove plot
 *   GET    /api/owner/plots        (owner) my plots
 *   POST   /api/bookings           (public) booking enquiry
 *   GET    /api/owner/bookings     (owner) my booking enquiries
 *   GET    /api/health
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLOTS_FILE = path.join(DATA_DIR, 'plots.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const DATA = {
  users: load(USERS_FILE, []),
  plots: load(PLOTS_FILE, []),
  sessions: load(SESSIONS_FILE, {}),
  bookings: load(path.join(DATA_DIR, 'bookings.json'), []),
};

function load(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function saveUsers() { save(USERS_FILE, DATA.users); }
function savePlots() { save(PLOTS_FILE, DATA.plots); }
function saveSessions() { save(SESSIONS_FILE, DATA.sessions); }

/* ---------------- crypto helpers ---------------- */

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

/* ---------------- auth helpers ---------------- */

function currentUser(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)sr_session=([a-f0-9]+)/);
  if (!m) return null;
  const session = DATA.sessions[m[1]];
  if (!session || (session.expiresAt && session.expiresAt < Date.now())) {
    delete DATA.sessions[m[1]];
    saveSessions();
    return null;
  }
  return DATA.users.find(u => u.id === session.userId) || null;
}

function requireOwner(req) {
  const user = currentUser(req);
  if (!user) return null;
  return user;
}

/* ---------------- plot helpers ---------------- */

const PLOT_TYPES = [
  'banquet-hall', 'garden', 'residence', 'conference-hall', 'beachfront', 'rooftop',
  'farmhouse', 'ballroom', 'auditorium', 'wedding-mandap', 'studio', 'hotel',
  'tent', 'pavilion', 'clubhouse', 'other',
];

const PAYMENT_METHODS = ['card', 'upi', 'paypal', 'bank-transfer', 'cash'];

const TYPE_LABELS = {
  'banquet-hall': 'Banquet Hall', 'garden': 'Garden', 'residence': 'Residence / Villa',
  'conference-hall': 'Conference Hall', 'beachfront': 'Beachfront', 'rooftop': 'Rooftop',
  'farmhouse': 'Farmhouse', 'ballroom': 'Grand Ballroom', 'auditorium': 'Auditorium',
  'wedding-mandap': 'Wedding Mandap / Lawn', 'studio': 'Photo / Event Studio',
  'hotel': 'Hotel / Resort', 'tent': 'Tent / Marquee', 'pavilion': 'Pavilion',
  'clubhouse': 'Clubhouse', 'other': 'Other',
};

function normalizePlot(body, owner) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const p = {
    id: body.id || newToken(),
    ownerId: owner.id,
    ownerName: owner.name,
    ownerEmail: owner.email,
    name: String(body.name || '').trim(),
    type: PLOT_TYPES.includes(body.type) ? body.type : 'other',
    location: String(body.location || '').trim(),
    city: String(body.city || '').trim(),
    area: String(body.area || '').trim(),
    pricePerDay: Math.max(0, Number(body.pricePerDay) || 0),
    currency: String(body.currency || 'USD').trim() || 'USD',
    capacity: Math.max(0, Number(body.capacity) || 0),
    amenities: Array.isArray(body.amenities) ? body.amenities.map(String).slice(0, 30) : [],
    description: String(body.description || '').trim().slice(0, 2000),
    images: Array.isArray(body.images) ? body.images.map(String).slice(0, 10) : [],
    paymentMethods: Array.isArray(body.paymentMethods)
      ? body.paymentMethods.filter(m => PAYMENT_METHODS.includes(m))
      : (typeof body.paymentMethods === 'string' && body.paymentMethods
        ? body.paymentMethods.split(',').map(s => s.trim().toLowerCase()).filter(m => PAYMENT_METHODS.includes(m))
        : []),
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
    available: body.available === undefined ? true : Boolean(body.available),
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return p;
}

function validatePlot(p) {
  const errors = [];
  if (!p.name) errors.push('name is required');
  if (!p.location) errors.push('location is required');
  if (!p.city) errors.push('city is required');
  if (!Number.isFinite(p.pricePerDay) || p.pricePerDay <= 0) errors.push('pricePerDay must be a positive number');
  if (p.capacity < 0) errors.push('capacity must be 0 or more');
  return errors;
}

/* ---------------- HTTP plumbing ---------------- */

function sendJSON(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...(extraHeaders || {}),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^([.][.][/\\])+/, '');
  const abs = path.join(PUBLIC_DIR, filePath);
  if (!abs.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(abs, (err, buf) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, idx) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---------------- API handlers ---------------- */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // e.g. ['api','plots','abc']
  const method = req.method;

  // health
  if (url.pathname === '/api/health') {
    return sendJSON(res, 200, { ok: true, plots: DATA.plots.length });
  }

  // auth: register / login / logout / me
  if (parts[1] === 'auth') {
    const action = parts[2];
    if (method === 'POST' && action === 'register') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!name || !email || !password) return sendJSON(res, 400, { error: 'name, email and password are required' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJSON(res, 400, { error: 'invalid email address' });
      if (password.length < 6) return sendJSON(res, 400, { error: 'password must be at least 6 characters' });
      if (DATA.users.some(u => u.email === email)) return sendJSON(res, 409, { error: 'an account with this email already exists' });
      const { salt, hash } = hashPassword(password);
      const user = { id: newToken(), name, email, salt, hash, createdAt: new Date().toISOString() };
      DATA.users.push(user);
      saveUsers();
      const token = newToken();
      DATA.sessions[token] = { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 30 * 864e5 };
      saveSessions();
      return sendJSON(res, 201, { user: publicUser(user) }, { 'Set-Cookie': `sr_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}` });
    }
    if (method === 'POST' && action === 'login') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = DATA.users.find(u => u.email === email);
      if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return sendJSON(res, 401, { error: 'invalid email or password' });
      }
      const token = newToken();
      DATA.sessions[token] = { userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 30 * 864e5 };
      saveSessions();
      return sendJSON(res, 200, { user: publicUser(user) }, { 'Set-Cookie': `sr_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}` });
    }
    if (method === 'POST' && action === 'logout') {
      const cookie = req.headers.cookie || '';
      const m = cookie.match(/(?:^|;\s*)sr_session=([a-f0-9]+)/);
      if (m) { delete DATA.sessions[m[1]]; saveSessions(); }
      return sendJSON(res, 200, { ok: true }, { 'Set-Cookie': 'sr_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
    }
    if (method === 'GET' && action === 'me') {
      const user = currentUser(req);
      if (!user) return sendJSON(res, 401, { error: 'not authenticated' });
      return sendJSON(res, 200, { user: publicUser(user) });
    }
  }

  // plots
  if (parts[1] === 'plots') {
    const id = parts[2];

    // GET /api/plots  (public, with filters)
    if (method === 'GET' && !id) {
      const q = url.searchParams;
      let results = DATA.plots.slice();
      if (q.get('all') !== '1') results = results.filter(p => p.available);
      const loc = (q.get('location') || '').trim().toLowerCase();
      const type = q.get('type') || '';
      const maxPrice = Number(q.get('maxPrice'));
      const minCapacity = Number(q.get('minCapacity'));
      const text = (q.get('q') || '').trim().toLowerCase();
      if (loc) results = results.filter(p =>
        [p.location, p.city, p.area, p.name].some(v => v.toLowerCase().includes(loc)));
      if (type) results = results.filter(p => p.type === type);
      if (Number.isFinite(maxPrice) && maxPrice > 0) results = results.filter(p => p.pricePerDay <= maxPrice);
      if (Number.isFinite(minCapacity) && minCapacity > 0) results = results.filter(p => p.capacity >= minCapacity);
      if (text) results = results.filter(p =>
        [p.name, p.location, p.city, p.area, p.description, p.type].some(v => v.toLowerCase().includes(text)));
      results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return sendJSON(res, 200, { count: results.length, plots: results });
    }

    // GET /api/plots/:id
    if (method === 'GET' && id) {
      const plot = DATA.plots.find(p => p.id === id);
      if (!plot) return sendJSON(res, 404, { error: 'plot not found' });
      return sendJSON(res, 200, { plot });
    }

    // POST /api/plots  (owner)
    if (method === 'POST' && !id) {
      const owner = requireOwner(req);
      if (!owner) return sendJSON(res, 401, { error: 'login required: only owners can add plots' });
      const body = await readBody(req);
      const plot = normalizePlot(body, owner);
      const errors = validatePlot(plot);
      if (errors.length) return sendJSON(res, 400, { error: errors.join('; ') });
      DATA.plots.push(plot);
      savePlots();
      return sendJSON(res, 201, { plot });
    }

    // PUT /api/plots/:id  (owner of the plot)
    if (method === 'PUT' && id) {
      const owner = requireOwner(req);
      if (!owner) return sendJSON(res, 401, { error: 'login required' });
      const existing = DATA.plots.find(p => p.id === id);
      if (!existing) return sendJSON(res, 404, { error: 'plot not found' });
      if (existing.ownerId !== owner.id) return sendJSON(res, 403, { error: 'you can only edit your own plots' });
      const body = await readBody(req);
      const merged = { ...existing, ...body, id: existing.id, ownerId: existing.ownerId, ownerName: owner.name, ownerEmail: owner.email, createdAt: existing.createdAt };
      const plot = normalizePlot(merged, owner);
      const errors = validatePlot(plot);
      if (errors.length) return sendJSON(res, 400, { error: errors.join('; ') });
      DATA.plots = DATA.plots.map(p => (p.id === id ? plot : p));
      savePlots();
      return sendJSON(res, 200, { plot });
    }

    // DELETE /api/plots/:id  (owner of the plot)
    if (method === 'DELETE' && id) {
      const owner = requireOwner(req);
      if (!owner) return sendJSON(res, 401, { error: 'login required' });
      const existing = DATA.plots.find(p => p.id === id);
      if (!existing) return sendJSON(res, 404, { error: 'plot not found' });
      if (existing.ownerId !== owner.id) return sendJSON(res, 403, { error: 'you can only delete your own plots' });
      DATA.plots = DATA.plots.filter(p => p.id !== id);
      savePlots();
      return sendJSON(res, 200, { ok: true, deleted: existing.name });
    }
  }

  // GET /api/owner/plots (owner)
  if (parts[1] === 'owner' && parts[2] === 'plots' && method === 'GET') {
    const owner = requireOwner(req);
    if (!owner) return sendJSON(res, 401, { error: 'login required' });
    const mine = DATA.plots.filter(p => p.ownerId === owner.id);
    return sendJSON(res, 200, { count: mine.length, plots: mine });
  }

  // bookings: POST /api/bookings (public), GET /api/owner/bookings (owner)
  if (parts[1] === 'bookings' && method === 'POST') {
    const body = await readBody(req);
    const plot = DATA.plots.find(p => p.id === body.plotId);
    if (!plot) return sendJSON(res, 404, { error: 'plot not found' });
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const date = String(body.date || '').trim();
    const guests = Math.max(0, Number(body.guests) || 0);
    const payment = PAYMENT_METHODS.includes(body.payment) ? body.payment : 'card';
    const message = String(body.message || '').trim().slice(0, 500);
    if (!name || !email || !date) return sendJSON(res, 400, { error: 'name, email and date are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJSON(res, 400, { error: 'invalid email address' });
    const booking = {
      id: newToken(),
      plotId: plot.id,
      plotName: plot.name,
      plotCity: plot.city,
      ownerEmail: plot.ownerEmail,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      date,
      guests,
      paymentMethod: payment,
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    DATA.bookings.push(booking);
    save(path.join(DATA_DIR, 'bookings.json'), DATA.bookings);
    return sendJSON(res, 201, { bookingId: booking.id, reference: 'SR-' + booking.id.slice(0, 8).toUpperCase() });
  }

  if (parts[1] === 'owner' && parts[2] === 'bookings' && method === 'GET') {
    const owner = requireOwner(req);
    if (!owner) return sendJSON(res, 401, { error: 'login required' });
    const mine = DATA.bookings
      .filter(b => DATA.plots.some(p => p.id === b.plotId && p.ownerId === owner.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sendJSON(res, 200, { count: mine.length, bookings: mine });
  }

  return sendJSON(res, 404, { error: 'unknown API endpoint' });
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email };
}

/* ---------------- server ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
    } else {
      res.writeHead(405);
      res.end('Method not allowed');
    }
  } catch (err) {
    sendJSON(res, err.message === 'invalid JSON body' ? 400 : 500, { error: err.message || 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`SpaceRent server running at http://localhost:${PORT}`);
});