AR-Maintenance Support System
Web-based AR overlay that scans QR fault markers placed in a public-transport environment and surfaces fault location and description on a live camera feed, backed by a Node.js + Express server with JWT authentication and a small operations dashboard.

How to run
cd into folder
npm install
npm start
# open http://localhost:3000

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
