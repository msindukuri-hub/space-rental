# SpaceRent 📍

An online **space-rental system** for functions & events. Browse available venues, search by location, see the **rent per day**, view spaces **on a map**, and let owners **add new plots** or **delete them** — with the website updating instantly.

## Features

- **Public browse & search** — search by location/city/area/plot name, filter by space type, max daily price, and minimum guest capacity.
- **16 space types** — banquet hall, garden, residence/villa, conference hall, beachfront, rooftop, farmhouse, grand ballroom, auditorium, wedding mandap/lawn, studio, hotel/resort, tent/marquee, pavilion, clubhouse, other.
- **Map view** — every pinned listing shows on an interactive OpenStreetMap (Leaflet) with price popups; each detail page has its own map. Toggle **Grid ⇄ Map**.
- **Transparent pricing** — rent per day, multi-currency (USD, EUR, GBP, INR, AED, SGD, AUD, CAD).
- **Payment methods** — each listing shows what it accepts (Card, UPI, PayPal, Bank Transfer, Cash); visitors pick one when booking.
- **Booking requests** — visitors send a booking enquiry (date, guests, payment method, message); owners see all requests in their dashboard.
- **Owner accounts** — register & log in. **Add new plots**, **edit** any field, toggle "available for rent", or **delete** plots — changes go live immediately.
- **Two editions:**
  - **Server edition** (`server.js`) — full app with a real backend + JSON database. Multi-user, shared data.
  - **Static edition** (`docs/`) — runs 100% in the browser (localStorage). This is what deploys to **GitHub Pages** as a live demo.

## Quick start (server edition)

```bash
cd server
node seed.js      # (optional) create a demo owner + 12 sample plots
node server.js    # start on http://localhost:3000
```

Open **http://localhost:3000**.

### Demo owner login

| Email | Password |
|-------|----------|
| `owner@spacerent.demo` | `demo1234` |

## GitHub Pages (static edition)

The `docs/` folder is a self-contained static site — deploy it to GitHub Pages and it's live at `https://<you>.github.io/<repo>/`.

- All data (plots, accounts, bookings) is stored in the **browser's localStorage**, so it's a fully interactive **demo**: you can log in as the demo owner, add/delete spaces, and send bookings — but changes are per-browser, not shared.
- A "Reset demo data" link on the home page restores the original listings.
- The map (Leaflet) and fonts load from a CDN, so the page needs internet access.

> For a real shared, multi-user production site, deploy the **server edition** (below). The static edition is ideal for a public demo/preview.

## Deploying the server edition "online"

It's a single self-contained Node app with **zero dependencies** — deploy anywhere Node runs:

1. **Render / Railway / Fly.io / a VPS** — run `node server.js`; set `PORT` from the platform.
2. Put it behind HTTPS (all of the above do this automatically).
3. For many concurrent owners, swap the JSON store for a real database (e.g. PostgreSQL) — the API layer is cleanly separated so this is a contained change.

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/plots?location=&type=&maxPrice=&minCapacity=&q=&all=1` | — | List/search plots (only available by default) |
| GET | `/api/plots/:id` | — | One plot |
| POST | `/api/auth/register` | — | Create owner account `{name,email,password}` |
| POST | `/api/auth/login` | — | Log in `{email,password}` |
| POST | `/api/auth/logout` | — | Log out |
| GET | `/api/auth/me` | — | Current user |
| POST | `/api/plots` | owner | Add a plot |
| PUT | `/api/plots/:id` | owner | Update own plot |
| DELETE | `/api/plots/:id` | owner | Delete own plot |
| GET | `/api/owner/plots` | owner | My plots |
| POST | `/api/bookings` | — | Booking enquiry `{plotId,name,email,date,…}` |
| GET | `/api/owner/bookings` | owner | My booking enquiries |

### Plot fields

`name`, `type`, `location`, `city`, `area`, `lat`, `lng`, `pricePerDay`, `currency`, `capacity`, `paymentMethods[]` (card | upi | paypal | bank-transfer | cash), `amenities[]`, `description`, `images[]` (URLs), `available`.

## Structure

```
index.html         # static (GitHub Pages) edition — at repo root so Pages serves it
css/styles.css     # shared styles
js/data.js         # seed data for the static edition
js/app.js          # static-edition app (localStorage backend)
server/            # server edition (full backend + JSON database)
  server.js        #   HTTP server + JSON API (no dependencies)
  seed.js          #   demo owner + 12 sample plots
  data/            #   users.json, plots.json, sessions.json, bookings.json (runtime)
  public/          #   server-edition frontend
```