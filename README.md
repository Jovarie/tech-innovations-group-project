# AR Maintenance Support System
**TRL Prototype · Tech Innovations Group 2**

Augmented reality fault detection for public transport infrastructure. Engineers scan physical QR markers to surface live fault data, zone hazard information.

---

## Table of Contents
1. [Running Locally](#1-running-locally)
2. [Environment Variables](#2-environment-variables)
3. [Testing on Mobile with ngrok](#3-testing-on-mobile-with-ngrok)
4. [Demo Credentials](#4-demo-credentials)
5. [App Overview](#5-app-overview)
6. [QR Codes](#6-qr-codes)
7. [Deploying to Vercel](#7-deploying-to-vercel)
8. [Troubleshooting](#8-troubleshooting)

---

## Demo Credentials

| Username | Password | Role | Access |
|---|---|---|---|
| `engineer` | `maintain123` | Senior Engineer | Full AR access, fault management, restricted zones |
| `junior` | `tech123` | Junior Technician | Basic AR access |
| `secadmin` | `admin123` | Security Admin | Full access including admin controls |
| `auditor` | `audit123` | System Auditor | Read-only access |

## 1. Running Locally

**Requirements:** Node.js 18+

```bash
git clone https://github.com/Jovarie/tech-innovations-group-project.git
cd tech-innovations-group-project
npm install
cp .env.example .env    # create your local env file
npm start
```

Open **http://localhost:3000** in your browser.

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in the values. **Never commit `.env` — it is gitignored.**

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Long random string used to sign auth tokens. Change from the default. |
| `PORT` | No | Port the server listens on. Defaults to `3000`. |
| `TOKEN_TTL` | No | How long a login session lasts. Defaults to `8h`. |
| `UPSTASH_REDIS_REST_URL` | Optional | Enables shared state across Vercel instances (see §7). |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Required alongside the URL above. |

Minimum `.env` for local dev:
```
JWT_SECRET=any-long-random-string-here
PORT=3000
TOKEN_TTL=8h
```

---

## 3. Testing on Mobile with ngrok

The scanner and tool tracker require a camera. Browsers only allow camera access on `https://` or `http://localhost`. To test on a phone you need a public HTTPS URL — ngrok creates one that tunnels to your laptop.

### One-time setup

1. Sign up free at [ngrok.com](https://ngrok.com)
2. Install ngrok:
   ```bash
   # Mac
   brew install ngrok

   # Or download from https://ngrok.com/download
   ```
3. Add your auth token (found in the ngrok dashboard):
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

### Every time you want to demo on a phone

**Terminal 1 — start the app:**
```bash
npm start
```

**Terminal 2 — start the tunnel:**
```bash
ngrok http 3000
```

Ngrok prints a line like:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000
```

Open that `https://` URL on any phone or device. Everyone hitting that URL shares the same server, so fault fixes on the scanner appear on the dashboard in real time.

> **Keep both terminals open** for the duration of the demo. The ngrok URL changes every time you restart ngrok (free tier). For a fixed URL, set a static domain in the ngrok dashboard.

---

## 4. App Overview

### Scanner (`/scanner.html`)
- Point the camera at a fault QR code
- The AR overlay locks onto the screen showing fault ID, location, priority, and zone
- Tap **Begin Repair** to enter the repair workflow
- Step 1: scan the required tools out using the tool tracker
- Step 2: verify tools are present, then tap **Confirm Fix & Close Task**
- The fault status updates to `FIXED` and the dashboard reflects it

### Tool Tracker (`/tool-tracker.html`)
- Point the camera at a tool QR code
- The overlay shows whether the tool is **AVAILABLE** or **CHECKED OUT**
- Tap **Check Out** to log it against a fault session (optionally link a fault ID)
- Tap **Check In** to return it
- The **session panel** (wrench icon, bottom right) shows all tools currently out with elapsed time
- Tap **View History** to see the full checkout/checkin log for this session

### Dashboard (`/dashboard.html`)
- Live fault table with status badges — polls every 5 seconds
- Analytics charts: faults by status and priority
- Zone access panel — restricted zones only visible to Senior Engineer / Security Admin
- Tool session panel showing any overdue checkouts
- **Reset Faults** button restores all faults to their original seed state (demo utility)

### Tool QR Codes (`/tool-qrs.html`)
- Printable QR codes for all 7 physical tools
- Print and attach to the actual tools before the demo

### Fault QR Codes (`/fault-qrs.html`)
- Printable QR codes for all 3 fault markers
- Print and place at the physical fault locations before the demo
- Also accessible via the **Fault QR Codes** button on the Dashboard

---

## 5. QR Codes

### Fault QR codes
Visit `/fault-qrs.html` on the running app to generate and print all fault QR codes.

| QR Content | Fault | Location | Required Tools |
|---|---|---|---|
| `FAULT-101` | Signal Fault | Track 1 — 10m right | Multimeter, Voltage Probe |
| `FAULT-102` | Cable Degradation | Service Corridor B — 5m left | Wrench, Thermal Camera, Insulation Tape |
| `FAULT-103` | Structural Wear | Tunnel Section B — 15m ahead | Inspection Torch, Crack Gauge |

### Tool QR codes
Visit `/tool-qrs.html` on the running app to generate and print all tool QR codes.

| QR Content | Tool |
|---|---|
| `TOOL-WRENCH-01` | Adjustable Wrench |
| `TOOL-MULTI-02` | Multimeter |
| `TOOL-TORCH-03` | Inspection Torch |
| `TOOL-THERMAL-04` | Thermal Camera |
| `TOOL-GAUGE-05` | Crack Gauge |
| `TOOL-PROBE-06` | Voltage Probe |
| `TOOL-TAPE-07` | Insulation Tape |

---

## 6. Deploying to Vercel

The app is deployed at the connected Vercel project. Every merge to `main` triggers a redeploy automatically.

### Required Vercel environment variables

Go to **Vercel → Project → Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `JWT_SECRET` | Any long random string |

### Optional — shared state across devices on Vercel

Vercel runs multiple serverless instances. Without a shared store, fault updates on one device may not appear on another. To fix this, add Upstash Redis:

1. Create a free database at [upstash.com](https://upstash.com)
2. Copy the **REST URL** and **REST Token** from the database page
3. Add to Vercel env vars:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

> For demos, running locally with ngrok (§3) avoids this entirely — one process, shared state, zero config.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `npm: command not found` | Install Node.js from [nodejs.org](https://nodejs.org) |
| `Cannot find module 'express'` | Run `npm install` again |
| Port 3000 in use | `PORT=4000 npm start` then open `http://localhost:4000` |
| Camera button does nothing | URL must be `https://` or `http://localhost` — not `file://` or plain `http://` |
| Camera blocked on phone | Use the ngrok HTTPS URL, not your laptop's IP address |
| `500: INTERNAL_SERVER_ERROR` on Vercel | Check that `JWT_SECRET` is set in Vercel environment variables |
| Dashboard not updating after fault fix | Use ngrok for demos (one process), or set up Upstash Redis for Vercel |
| Tool session resets to 0 | Same as above — use ngrok for cross-device demos |
