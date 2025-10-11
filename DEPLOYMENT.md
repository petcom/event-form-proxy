# Event Form Proxy Deployment Guide

This guide walks through deploying and operating the Signal9 event/contact form proxy. It consolidates both contact and event tracking submissions behind a single Express service so upstream forms can POST to `/proxy-api/forms` regardless of form type.

---

## 1. Prerequisites

- **Node.js 18+** (matches the version used during development).
- **npm** (ships with Node).
- Access to deploy on the target host (SSH, PM2, Docker, etc.).
- Google Apps Script deployments for:
  - Contact form spreadsheet endpoint (`GOOGLE_SCRIPT_URL`).
  - Event tracking spreadsheet endpoint (`TRACKING_SCRIPT_URL`), configured to allow anonymous POSTs ("Anyone" or "Anyone with the link").
- Spreadsheet IDs and sheet names for all contact and tracking maps you intend to support.

---

## 2. Repository structure

```
/ (root)
├─ proxy/                 # Node/Express proxy
│  ├─ config/             # Environment loader, cache configuration
│  ├─ routes/             # Includes unified forms route, API proxy, audio handler
│  ├─ server.js           # Express bootstrapping
│  ├─ package.json        # npm metadata + scripts
│  └─ .env.example?       # (use actual .env; not committed) 
├─ google-scripts/        # App Script HTML/snippets (e.g. dance_event_form.html)
├─ nginx_configs/         # Sample Nginx reverse proxy configs (if used)
└─ DEPLOYMENT.md          # This guide
```

The key change from earlier iterations is that **`routes/forms.js` now handles both contact and event RSVPs**; `routes/eventTracking.js` is retained only as a stub to advise callers to use `/proxy-api/forms`.

---

## 3. Environment configuration

Create `proxy/.env` (or manage via your deployment system). Required keys:

```ini
PORT=8180                              # Listener port for Express
TARGET_URL=http://localhost:3000       # Origin for legacy /proxy-api/* pass-through
API_PATH=/api                          # Used when building FULL_API_URL/LOGIN_URL
LOGIN_PATH=/jwtlogin
LOGIN_USER=...                         # Optional basic auth for proxied login
LOGIN_PASS=...

CACHE_TTL_MS=60000                     # Contact proxy cache TTL
CACHE_MAX_SIZE=512000                  # Cache size (bytes)

GOOGLE_SCRIPT_URL=https://script.google.com/...  # Contact form Apps Script URL
TRACKING_SCRIPT_URL=https://script.google.com/...# Event tracking Apps Script URL

SHEET_MAP_JSON={
  "RLC-contact": {"spreadsheetId":"...","sheetName":"contact1"},
  "RLA-contact": {"spreadsheetId":"...","sheetName":"contact1"},
  "SONAR-contact": {"spreadsheetId":"...","sheetName":"contact1"},
  "Signal9-contact": {"spreadsheetId":"...","sheetName":"contact1"}
}

TRACK_MAP_JSON={
  "RLA-track": {"spreadsheetId":"...","sheetName":"2025-1"}
}

EVENT_TRACKING_THROTTLE_MS=15000       # Optional; defaults to 15s between submissions
DIGITAL_OCEAN_CDN=...
CDN_AUDIO_DIR=mixer
ALLOWED_AUDIO_PROFILES=andrew,pro,basic
```

Notes:
- `SHEET_MAP_JSON` keys correspond to contact form `sheetKey` values.
- `TRACK_MAP_JSON` keys correspond to event RSVP `trackingKey` values.
- The merged router decides whether a request is tracking vs. contact by inspecting `form_type` (expecting `event_rsvp`) or the presence of `trackingKey` without a `sheetKey`.

---

## 4. Installing dependencies

From the repository root, install dependencies for the proxy:

```bash
cd proxy
npm install
```

(Dependencies are already committed via `package-lock.json`; reinstall when environments change.)

---

## 5. Running locally

```bash
cd proxy
npm start
```

Startup logging will show loaded contact/tracking keys. The server exposes:

- `POST /proxy-api/forms` → Unified handler (contact or event)
- `POST /proxy-api/*` → General API proxy (unchanged)
- `POST /forms` → Deprecated (stub)

### Test the flows locally

**Contact flow:**
```bash
curl -s -D - \
  -H "Content-Type: application/json" \
  -X POST http://localhost:8180/proxy-api/forms \
  -d '{
        "sheetKey": "RLC-contact",
        "first_name": "Test",
        "email": "test@example.com"
      }'
```

**Event tracking flow:**
```bash
curl -s -D - \
  -H "Content-Type: application/json" \
  -X POST http://localhost:8180/proxy-api/forms \
  -d '{
        "form_type": "event_rsvp",
        "event_slug": "mindful-dance-open-house",
        "first_name": "Test",
        "email": "test@example.com",
        "trackingKey": "RLA-track"
      }'
```

The event request will bridge to `TRACKING_SCRIPT_URL`. If that Apps Script isn’t publicly accessible you may see `502` with `403 Access Denied` detail.

---

## 6. Deploying

You can deploy via your preferred process (PM2, systemd, Docker, or the provided scripts). Example using the included PM2 script:

```bash
cd proxy
./deploy_pm2_eventformproxy.sh
```

Ensure the script is configured with the correct working directory and environment. For Docker or systemd setups, replicate the `npm start` command inside the service definition.

### Reverse proxy (optional)

If fronting the Node service with Nginx, route traffic so external clients hit `/proxy-api/*` while the event landing pages have their form `action` pointing to the same path. The included `nginx_configs/` directory can be adapted as needed.

---

## 7. Integrating client forms

- Contact forms should POST to `/proxy-api/forms` with a `sheetKey` matching `SHEET_MAP_JSON`.
- Event RSVP forms should POST to the same endpoint but include `form_type: "event_rsvp"` (recommended) and a `trackingKey` matching `TRACK_MAP_JSON`. Optional `sheetName` overrides the default from the map.
- `dance_event_form.html` in `google-scripts/` demonstrates injecting hidden fields (`trackingKey`, `sheetName`) and building the endpoint from `window.GHOST_CONFIG` (preferring a `formsApiUrl` or proxied `/proxy-api/forms`).

---

## 8. Monitoring & logging

Key log messages:
- `[FORMS] form_type: ... Routing to tracking|contact handler` — Confirms branch selection.
- `[TRACKING THROTTLE] ...` — Triggered when an RSVP submission hits the cooldown window.
- `[TRACKING SCRIPT ACCESS] 403 Access Denied ...` — Indicates the event Apps Script isn’t publicly accessible.

Consider piping logs to your platform’s monitoring solution (CloudWatch, Datadog, etc.).

---

## 9. Troubleshooting

| Symptom | Likely Cause | Remedy |
| --- | --- | --- |
| `Missing sheetKey...` response | Event form still sending `sheetKey` or missing `trackingKey` | Ensure RSVP payload only sends `trackingKey` (and `form_type`), not the contact params. |
| `Invalid trackingKey` | Key not present in `TRACK_MAP_JSON` | Update `.env` to include the new mapping, then restart. |
| `Tracking script returned 403` | Apps Script access restricted to authenticated users | Redeploy the Apps Script allowing public access or implement authenticated flow. |
| `Captcha response missing` on contact tests | Google Apps Script requires CAPTCHA fields for real submissions | Provide legit CAPTCHA tokens or disable checks in the script for testing. |

---

## 10. Future migrations

- Once confident no clients call `/forms`, delete `routes/eventTracking.js` entirely.
- Consider extracting throttling/validation into shared utilities if additional form types are added.
- If event tracking requires authentication, this proxy will need to exchange tokens or run as a service account; plan accordingly.

---

## 11. Contact

For questions or escalations:
- Internal Slack: `#signal9-devops`
- Email: `devops@signal9.com`
- Primary maintainer: Adam Petty (`adampetty@...`)

---

Happy deploying!
