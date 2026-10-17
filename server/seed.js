/**
 * Seed script: creates a demo owner account and sample plots.
 * Run: node seed.js   (safe to re-run; it skips if plots already exist)
 *
 * Demo owner login:  owner@spacerent.demo / demo1234
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PLOTS_FILE = path.join(DATA_DIR, 'plots.json');

function load(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function save(f, v) { fs.writeFileSync(f, JSON.stringify(v, null, 2)); }
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(password, salt, 32).toString('hex') };
}
function id() { return crypto.randomBytes(12).toString('hex'); }

fs.mkdirSync(DATA_DIR, { recursive: true });
const users = load(USERS_FILE, []);
const plots = load(PLOTS_FILE, []);

if (plots.length > 0) {
  console.log('Plots already exist (' + plots.length + ') — skipping seed.');
  process.exit(0);
}

const email = 'owner@spacerent.demo';
let owner = users.find(u => u.email === email);
if (!owner) {
  const { salt, hash } = hashPassword('demo1234');
  owner = { id: id(), name: 'Demo Owner', email, salt, hash, createdAt: new Date().toISOString() };
  users.push(owner);
  save(USERS_FILE, users);
  console.log('Created demo owner: ' + email + ' / demo1234');
}

const now = Date.now();
const daysAgo = d => new Date(now - d * 864e5).toISOString();

const samples = [
  {
    name: 'Grand Rose Banquet Hall', type: 'banquet-hall',
    location: '5th Avenue, near Central Park', city: 'New York', area: 'Manhattan',
    lat: 40.7651, lng: -73.9745,
    pricePerDay: 4500, currency: 'USD', capacity: 800,
    paymentMethods: ['card', 'bank-transfer'],
    amenities: ['Parking', 'Catering', 'Stage', 'Sound system', 'Lighting', 'Air conditioning', 'Generator backup', 'Wedding decor'],
    description: 'A stunning 12,000 sq ft banquet hall with crystal chandeliers, a grand staircase entrance, and a dedicated bridal suite. Perfect for weddings, galas, and large corporate events. In-house catering and a full AV team available.',
    images: [], available: true, createdAt: daysAgo(21),
  },
  {
    name: 'Willow Creek Garden Estate', type: 'garden',
    location: 'Willow Creek Road, 10 min from the lake', city: 'Chicago', area: 'Lincoln Park',
    lat: 41.9235, lng: -87.6499,
    pricePerDay: 2800, currency: 'USD', capacity: 350,
    paymentMethods: ['card', 'paypal'],
    amenities: ['Parking', 'Catering', 'Stage', 'Garden lighting', 'Wi-Fi', 'Security'],
    description: 'A lush 3-acre private garden estate with a rose courtyard, open-air pavilion, and a reflecting pond. Ideal for outdoor weddings, garden parties, and brand launches. Covered seating for 200 guests.',
    images: [], available: true, createdAt: daysAgo(18),
  },
  {
    name: 'Skyline Rooftop Lounge', type: 'rooftop',
    location: 'Downtown Tower, 42nd floor', city: 'Austin', area: 'Downtown',
    lat: 30.2650, lng: -97.7435,
    pricePerDay: 3200, currency: 'USD', capacity: 200,
    paymentMethods: ['card', 'paypal'],
    amenities: ['Air conditioning', 'Sound system', 'Lighting', 'Wi-Fi', 'Security', 'Catering'],
    description: 'A 360° rooftop venue with sweeping city views, a glass-walled lounge, and a private bar. Great for corporate launches, cocktail evenings, and intimate receptions. Sunset views guaranteed.',
    images: [], available: true, createdAt: daysAgo(12),
  },
  {
    name: 'Blue Lagoon Beachfront Villa', type: 'beachfront',
    location: 'Palm Beach Drive, direct beach access', city: 'Miami', area: 'South Beach',
    lat: 25.7826, lng: -80.1341,
    pricePerDay: 6000, currency: 'USD', capacity: 500,
    paymentMethods: ['card', 'bank-transfer'],
    amenities: ['Parking', 'Catering', 'Stage', 'Sound system', 'Accommodation', 'Security'],
    description: 'A private beachfront villa with 200 feet of exclusive shoreline, a pool deck, and a cabana lounge. Perfect for destination weddings, beach parties, and luxury brand events.',
    images: [], available: true, createdAt: daysAgo(10),
  },
  {
    name: 'Heritage Conference Centre', type: 'conference-hall',
    location: 'Business Park, Block C', city: 'London', area: 'Canary Wharf',
    lat: 51.5045, lng: -0.0181,
    pricePerDay: 2200, currency: 'GBP', capacity: 400,
    paymentMethods: ['card', 'bank-transfer'],
    amenities: ['Parking', 'Wi-Fi', 'Air conditioning', 'Sound system', 'Lighting', 'Catering', 'Security'],
    description: 'A modern conference centre with a main hall for 400, six breakout rooms, and a full AV production studio. Ideal for summits, product launches, and corporate conferences.',
    images: [], available: true, createdAt: daysAgo(8),
  },
  {
    name: 'Sunset Farmhouse Retreat', type: 'farmhouse',
    location: 'Meadow Lane, 15 min from the town centre', city: 'Bristol', area: 'Cotswolds',
    lat: 51.4549, lng: -2.5878,
    pricePerDay: 1800, currency: 'GBP', capacity: 150,
    paymentMethods: ['card', 'cash'],
    amenities: ['Parking', 'Catering', 'Accommodation', 'Garden lighting', 'Kitchen', 'Security'],
    description: 'A charming stone farmhouse surrounded by rolling meadows and wildflower fields. Includes a barn hall for 150, on-site accommodation for 20, and a private orchard. Perfect for rustic weddings and family gatherings.',
    images: [], available: true, createdAt: daysAgo(5),
  },
  {
    name: 'The Ivory Residence', type: 'residence',
    location: 'Hillcrest Avenue, gated community', city: 'Dubai', area: 'Palm Jumeirah',
    lat: 25.1124, lng: 55.1390,
    pricePerDay: 5000, currency: 'AED', capacity: 250,
    paymentMethods: ['card', 'bank-transfer', 'cash'],
    amenities: ['Parking', 'Catering', 'Air conditioning', 'Sound system', 'Lighting', 'Accommodation', 'Security', 'Wi-Fi'],
    description: 'A luxury 8-bedroom villa with a private pool, home theatre, and a landscaped courtyard. Ideal for private parties, family celebrations, and exclusive brand events.',
    images: [], available: true, createdAt: daysAgo(3),
  },
  {
    name: 'Riverside Pavilion', type: 'pavilion',
    location: 'Riverside Promenade, next to the footbridge', city: 'Singapore', area: 'Boat Quay',
    lat: 1.2884, lng: 103.8508,
    pricePerDay: 3000, currency: 'SGD', capacity: 300,
    paymentMethods: ['card', 'upi'],
    amenities: ['Parking', 'Catering', 'Stage', 'Sound system', 'Lighting', 'Security'],
    description: 'An open-air riverside pavilion with a covered terrace for 300, a floating stage, and waterfront dining. A popular choice for wedding receptions and corporate galas.',
    images: [], available: true, createdAt: daysAgo(2),
  },
  {
    name: 'Old Town Ballroom', type: 'ballroom',
    location: 'Heritage Square, historic district', city: 'Paris', area: 'Le Marais',
    lat: 48.8570, lng: 2.3620,
    pricePerDay: 3800, currency: 'EUR', capacity: 350,
    paymentMethods: ['card', 'bank-transfer'],
    amenities: ['Catering', 'Stage', 'Sound system', 'Lighting', 'Air conditioning', 'Wedding decor'],
    description: 'A restored 19th-century ballroom with ornate ceilings, a grand piano, and a marble dance floor. An iconic setting for weddings, galas, and cultural events.',
    images: [], available: true, createdAt: daysAgo(1),
  },
  {
    name: 'Lotus Wedding Mandap & Lawn', type: 'wedding-mandap',
    location: 'Lake View Road, beside the botanical garden', city: 'Mumbai', area: 'Bandra West',
    lat: 19.0544, lng: 72.8295,
    pricePerDay: 42000, currency: 'INR', capacity: 600,
    paymentMethods: ['upi', 'card', 'bank-transfer'],
    amenities: ['Parking', 'Catering', 'Stage', 'Sound system', 'Lighting', 'Wedding decor', 'Security', 'Generator backup'],
    description: 'A premium wedding lawn with a traditional mandap, fairy-light canopy, and a lake-view lawn for 600 guests. Includes a separate sangeet stage, valet parking, and in-house decor team for pheras and receptions.',
    images: [], available: true, createdAt: daysAgo(4),
  },
  {
    name: 'CineStar Auditorium', type: 'auditorium',
    location: 'Media City, Tower 2', city: 'Bengaluru', area: 'Whitefield',
    lat: 12.9698, lng: 77.7500,
    pricePerDay: 35000, currency: 'INR', capacity: 1000,
    paymentMethods: ['upi', 'card', 'bank-transfer'],
    amenities: ['Parking', 'Wi-Fi', 'Air conditioning', 'Sound system', 'Lighting', 'Catering', 'Security'],
    description: 'A 1000-seat cinema-grade auditorium with a 40ft LED screen, Dolby sound, and a 360° projection dome. Perfect for product launches, award nights, and corporate town halls.',
    images: [], available: true, createdAt: daysAgo(3),
  },
  {
    name: 'Marquee on the Green', type: 'tent',
    location: 'Green Valley Estate, main lawns', city: 'Bengaluru', area: 'Hennur',
    lat: 13.1100, lng: 77.6200,
    pricePerDay: 28000, currency: 'INR', capacity: 450,
    paymentMethods: ['upi', 'cash'],
    amenities: ['Parking', 'Catering', 'Stage', 'Sound system', 'Lighting', 'Security', 'Generator backup'],
    description: 'A 50,000 sq ft open lawns estate with a royal marquee tent for 450, floating bar, and a dedicated lawn for car parking. Popular for pre-wedding functions and large family celebrations.',
    images: [], available: true, createdAt: daysAgo(2),
  },
];

const newPlots = samples.map((s, i) => ({
  id: id(),
  ownerId: owner.id,
  ownerName: owner.name,
  ownerEmail: owner.email,
  name: s.name, type: s.type, location: s.location, city: s.city, area: s.area,
  lat: s.lat, lng: s.lng,
  pricePerDay: s.pricePerDay, currency: s.currency, capacity: s.capacity,
  paymentMethods: s.paymentMethods || [],
  amenities: s.amenities, description: s.description, images: s.images,
  available: s.available, createdAt: s.createdAt, updatedAt: s.createdAt,
}));

save(PLOTS_FILE, newPlots);
console.log('Seeded ' + newPlots.length + ' sample plots.');
console.log('Demo owner: ' + email + ' / demo1234');