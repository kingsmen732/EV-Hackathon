# ChargeMesh — AI EV charging network

> **"Waiting in line, burning the grid"**: solved with predictive reservations, grid-aware AI matching, energy sharing and dynamic priority membership.

ChargeMesh is an installable **PWA** (Next.js 15) with a **FastAPI** intelligence engine. Both deploy together as **one Vercel project** on your own domain. It runs on a live simulation of a Chennai charging network: 16 public stations, 5 private energy-sharing hosts, 3 mobile top-up vans and 5 distribution feeders. The simulation advances 1 simulated minute per real second.

| Screen | What it shows |
|---|---|
| **Sign up / Log in** (`/signup`, `/login`) | Email + password accounts. Protected pages redirect here. |
| **Onboarding** (`/onboarding`) | 5-step vehicle wizard: make → model and battery variant → charging connectors and rates → year, battery and odometer → a review of the derived charging profile. |
| **Garage** (`/garage`) | Up to 5 vehicles per account. Edit, remove, or switch which one is active. |
| **Drive** (`/`) | Driver app. Set up your EV, pick "optimise for" and how flexible you are, then get ranked matches with a "why" breakdown. Reserve a bay, then watch the car drive there, queue and charge live. |
| **Ops Console** (backend `/admin`) | Operators only; not part of the driver app. Controls the simulated clock and scenarios, and shows grid and feeder telemetry, the event log and revenue. See `backend/README.md`. |
| **Plans** (`/plans`) | Business model. Covers membership tiers, the live Priority Pass price, unit economics and a live revenue breakdown. |

---

## Accounts and vehicle profile (`backend/evcore/accounts.py`, `backend/evcore/vehicles.py`)
- **Auth:**
  - Passwords are hashed with scrypt.
  - Sessions are stored server-side with a 30-day TTL and sent as an HMAC-signed, HttpOnly, SameSite=Lax cookie. Logout revokes the session.
  - Failed logins are limited per email and per IP.
  - `middleware.ts` redirects signed-out visitors away from Drive, Garage and Onboarding.
- **Vehicle catalogue:** 20+ Indian-market EVs, from Tata, MG, Mahindra, Hyundai, Kia, BYD, Citroën and Ather. Specs are approximate defaults the driver can edit, and an "Other" option allows full manual entry.
- **Connectors:** CCS2, Type 2, Bharat DC-001 (GB/T), Bharat AC-001 and LECCS. The engine *only* considers bays whose connector the vehicle has.
- **Age model:**
  - Battery health: about 2.5% loss in year 1, then about 1.8% per year. High mileage adds wear. Floor 70%.
  - DC fast-charge acceptance: −2.5% per year.
  - Charging starts slowing earlier as the battery ages: at 80% when new, moving down to 72%.
  - Energy use: +1% per year.
- **Charger specs:** rated kW, connector, maximum output current and maximum output voltage.
  - Power actually delivered = the lowest of: the charger rating, the vehicle's (age-derated) DC/AC limit, and the charger's current limit × the pack voltage.
  - 800 V cars on 500 V chargers charge in boost mode at about 55% power.
  - The UI shows *why* ("CCS2 120 kW → 43 kW for your car (vehicle DC limit)").

## Maps: Ola Maps (Krutrim) (`components/OlaMap.tsx`, `backend/evcore/olamaps.py`)
- **Map:** the frontend renders an `olamaps-web-sdk` vector map using the `default-dark-standard` style, with HTML station markers and GeoJSON route and traffic layers.
  - If `NEXT_PUBLIC_OLA_MAPS_API_KEY` is missing, or the tiles fail to load (for example, a domain restriction), it falls back to Leaflet + CARTO automatically.
- **Server-side routing** (FastAPI):
  - Distance Matrix gives live road km and traffic-aware ETAs for every candidate station when you search.
  - Directions gives the real road path; your car drives along it on the map.
  - Places Autocomplete powers the "Starting point" search.
  - Calls authenticate with OAuth client-credentials (`OLA_MAPS_CLIENT_ID/SECRET`) or the API key. They are cached in KV, time out after 4 s, and fall back to the built-in distance model.
  - `/api/health` reports Ola call success/failure counts.

## How the AI works

**1. Prediction** (`backend/evcore/forecast.py`)
- **Charger free-time:** for each bay, the remaining session time is simulated from live SoC and a CC-CV taper curve, using the feeder's current throttle. Upcoming reservations on that bay are then chained on.
- **Station wait:** a multi-server queue projection. It uses an earliest-free heap over the people already queued plus expected walk-ins arriving before you (a Poisson rate by hour of day).
- **Online learning:** every observed wait updates a per-station calibration factor (exponentially smoothed actual/predicted ratio). The live MAE is shown in the Ops Console.
- **Feeder load forecast:** the daily base-load profile plus EV load. The EV load relaxes from its current value towards the Little's-law steady state (λ × avg session × avg kW) for that hour.

**2. Matching** (`backend/evcore/matcher.py`). Every (station × DC/AC × departure time) option is scored on the five inputs from the brief:

| Input | Used as |
|---|---|
| Charger availability | predicted wait at *your* arrival time, and the exact bay |
| Battery status | reachability, arrival SoC, charge-curve duration, critical-battery urgency |
| Grid load | feeder utilisation and expected throttle at arrival (penalised above 80%) |
| Location | road distance × time-of-day traffic speed |
| Priority scheduling | tier / Priority Pass, which set queue rank and a guaranteed power floor |

`score = time·w_t + ₹·w_c + grid_penalty·w_g`, with weights set by the driver's preference (balanced, fastest, cheapest or greenest). If the driver is flexible, **green-window** variants (leave 30–180 min later) are searched. They are offered when they are ≥7% cheaper or cut feeder load by ≥8 points.

**3. Scheduling and grid control** (`backend/evcore/world.py`)
- **Reservations hold a bay.** The dispatcher **gap-fills**: a walk-in only gets a held bay if it will finish before the booked car arrives.
- **Queue priority** = tier + low-battery urgency + Priority Pass + reservation + aging (to prevent starvation).
- **Smart load control:** when EV demand exceeds a feeder's 95% headroom, Fleet Pro, Priority Pass and critical-battery sessions keep full power first, and Plus sessions keep at least 80%. The remainder is shared proportionally. Deferred kWh and peak kW shaved are tracked.
- **Energy sharing:** private hosts (apartments, office campuses, fleet depots) open chargers in time windows at their own price. Mobile V2V vans rescue stranded EVs.

**Baseline comparison:** 60% of simulated drivers are walk-ins who just go to the nearest station. 40% use the app. The Ops Console shows both groups' waits side by side.

## Business model (`backend/evcore/pricing.py`)
- **Energy markup commission:** 6–20% on top of (utility ToD tariff + CPO fee). It rises with feeder stress and queue pressure, which also nudges demand off-peak.
- **Energy-sharing commission:** 12% of the host's price.
- **Dynamic priority membership:**
  - **Plus** (₹199/mo): 40% lower markup, queue +15, 80% power floor.
  - **Fleet Pro** (₹799/vehicle/mo): 60% lower markup, queue +30, never throttled.
  - **Priority Pass:** priced live, ₹29 + ₹15 per queued car + a stress premium, capped at ₹249.
- **Mobile top-up:** ₹249 call-out + ₹22/kWh.

All tariffs, fleet specs and subscriber counts are simulation assumptions. Edit them in `backend/evcore/data.py` and `backend/evcore/pricing.py`.

---

## Languages
The driver app is available in English, हिन्दी, தமிழ், తెలుగు, ಕನ್ನಡ, മലയാളം and मराठी.
- **Where to change it:** use the language button on the map. It is also in the header on other pages, and on the login screen.
- **What changes:**
  - All app text switches language.
  - Map labels switch too, using Ola Maps' regional styles (`default-{dark|light}-standard-{hi,ta,te,kn,mr,ml}`).
  - Malayalam labels exist only on the light map, so choosing Malayalam switches the map to light automatically.
- **Where it's saved:** in the browser, and on the account (`PATCH /api/me {lang}`) when you're logged in.
- **Adding or editing strings:** English strings live in `lib/i18n/en.ts`; each other language has its own file, loaded only when that language is selected.
- **Note:** the translations were machine-drafted. Have a native speaker review them before launch.

## Architecture
```
Browser (PWA) ──► Vercel: Next.js frontend ──/api/* rewrite──► Render: FastAPI (backend/) ──► Render Key Value (Redis)
                         (your domain)                          chargemesh-api.onrender.com    └► Ola Maps APIs
```
- **Frontend (this repo root):** deployed on **Vercel**. `next.config.mjs` proxies `/api/*` to `BACKEND_URL`, so login cookies stay first-party on your domain.
- **Backend (`backend/`):** a **separate git repo**, deployed on **Render** with `backend/render.yaml`. See `backend/README.md`.

## Run locally
Requirements: Node 20+, Python 3.10+.

```bash
npm install
pip install -r backend/requirements-dev.txt
npm run dev          # Next.js on :3000 + FastAPI (backend/) on :8000, proxied at /api
```
- Open http://localhost:3000. The API docs are at http://localhost:3000/api/docs.
- Backend tests: `npm test`.
- Frontend env goes in `.env.local`: `NEXT_PUBLIC_OLA_MAPS_API_KEY`, and optionally `BACKEND_URL`.
- Backend secrets go in `backend/.env`. It is auto-loaded locally and git-ignored.
- Without Redis, the backend keeps the simulation, accounts and sessions in memory. Restarting it resets them.

## Deploy

### 1. Backend → Render
```bash
cd backend
git remote add origin git@github.com:<you>/chargemesh-api.git
git push -u origin main
```
In Render, choose **New → Blueprint** and pick that repo. `render.yaml` creates:
- The FastAPI web service, in the Singapore region, with health check `/api/health`.
- A private Key Value instance, wired in as `REDIS_URL`.
- An auto-generated `AUTH_SECRET`.

When prompted, enter `OLA_MAPS_API_KEY`, `OLA_MAPS_CLIENT_ID` and `OLA_MAPS_CLIENT_SECRET`. Note the service URL, for example `https://chargemesh-api.onrender.com`.

### 2. Frontend → Vercel (with your domain)
1. Push this root folder to its own GitHub repo. `backend/` is git-ignored here.
2. In Vercel, choose **Add New → Project** and import the repo. It is detected as Next.js.
3. **Environment variables:**
   - `BACKEND_URL` = the Render URL.
   - `NEXT_PUBLIC_OLA_MAPS_API_KEY` = your Ola browser key. Restrict it to your domain in the Ola console.
   - `NEXT_PUBLIC_SITE_URL` = `https://yourdomain.com`.
4. **Custom domain:** go to **Settings → Domains → Add**. At your DNS provider, add the record Vercel shows (usually A `@ → 76.76.21.21`, or CNAME `www → cname.vercel-dns.com`). HTTPS is automatic.
5. **Optional:** give the API its own domain (`api.yourdomain.com`) in Render → Custom Domains, then point `BACKEND_URL` at it.

**Free-plan caveats:**
- **Cold starts:** Render's free web service sleeps after about 15 idle minutes, and the first request can take about a minute (the UI keeps polling and recovers). Use Starter for judging day.
- **Data loss on restart:** free Key Value doesn't persist across restarts. Use a paid plan, or Upstash via `KV_REST_API_URL`/`KV_REST_API_TOKEN`, if accounts must survive.

## Demo script (3 minutes)
0. **Sign up**, then add a 2021 Nexon EV. The review step shows about 89% battery health and DC derated to about 43 kW. Also add an **MG Comet** (AC only): the map greys out every station without Type 2, and matches only use AC bays.
1. **Ops Console** (`<backend>/admin`). Point out that feeders are climbing towards the 20:00 peak, and that AI-routed waits are well below walk-in waits.
2. **Drive.** Set battery to 25% and choose *Balanced*, then *Find my best charge*. Show the "Nearest station would take X min, AI saves Y" banner and open "Why this match?".
3. **Reserve.** Watch the car drive, then see the held bay (purple) and live charging kW.
4. **Ops Console → Feeder fault** on the feeder you're charging on. Basic sessions get throttled (amber bays) while Fleet/Priority keep full power. Show peak shaved and deferred kWh.
5. **Demand surge.** Queues spike, the Priority Pass price rises (see Plans), and matches spread load across stations and shared hosts.
6. **Set battery to 5%.** You get critical-priority matching, or you can *Request mobile top-up* and watch the van drive to you.
7. **Plans.** Walk through the revenue streams and unit economics.

## Project layout
```
app/              Next.js pages: /, /login, /signup, /onboarding, /garage, /plans (+ PWA manifest, error/404)
components/       OlaMap / Leaflet fallback, driver cards, vehicle wizard, auth form
lib/              API client, auth, i18n (7 languages), toasts, polling hook, types, map icons
middleware.ts     Redirects signed-out users to /login
public/           sw.js (service worker), icons, offline page
next.config.mjs   /api/* → BACKEND_URL proxy
backend/          FastAPI service — separate git repo for Render (evcore/, tests/, render.yaml)
```
