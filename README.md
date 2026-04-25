AR-Maintenance Support System
Web-based AR overlay that scans QR fault markers placed in a public-transport environment and surfaces fault location and description on a live camera feed, backed by a Node.js + Express server with JWT authentication and a small operations dashboard.

How to run:
cd into folder,
npm install,
npm start,
# open http://localhost:3000

## Testing AR scanner on Mobile

The scanner uses your phone's camera, we use [ngrok](https://ngrok.com) to give
our local server a temporary public HTTPS URL.

### One-time setup

1. Sign up for a free account at [ngrok.com](https://ngrok.com).
2. Download and install the ngrok app for your operating system.
3. Copy your auth token from the ngrok dashboard, then run:
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   
4. Each time you want to test on a phone
In one terminal, start the app as normal:
npm start

In a second terminal, start the tunnel:
ngrok http 3000

ngrok will print a line like:
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000

5. copy the forwarding link into your mobile browser.

Demo credentials
Username: engineer
Password: maintain123
Predefined fault QR codes:

FAULT-101	Signal Fault	Track 1 — 10m right
FAULT-102	Cable Degradation	Service Corridor B — 5m left
FAULT-103	Structural Wear	Tunnel Section B — 15m ahead
Unknown payloads render as an explicit "Unknown Marker" overlay (defence against QR spoofing).

Notes
Camera access requires https:// or http://localhost. The page will not work over plain file://.
For mobile testing on the same LAN, expose the dev server with ngrok http 3000 and open the HTTPS URL on the phone.


Quick troubleshooting:
Problem	Fix
npm: command not found	Install Node.js
Error: Cannot find module 'express'	Run npm install again
Port 3000 in use	PORT=4000 npm start then open http://localhost:4000
Camera button does nothing	Make sure URL is http://localhost:3000 (not file://)
Camera blocked on phone	Use the ngrok HTTPS URL, not your laptop's IP
