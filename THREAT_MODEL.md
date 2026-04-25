Threat Model — AR Maintenance Support System
Scope: TRL 3 prototype — web client (welcome / login / scanner / dashboard) + Node.js + Express backend, JWT-based auth, in-memory fault registry.

This document follows the STRIDE framework (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege) and applies it to the assets and trust boundaries of the prototype.

1. System Assets
ID	Asset	Why it matters
A1	Engineer credentials (username + password)	Gateway to all maintenance data
A2	JWT session tokens	Bearer credential to protected APIs
A3	Fault registry (/api/faults)	Operationally sensitive infrastructure data
A4	QR fault markers placed on physical infrastructure	Physical bridge between asset and digital record
A5	Backend secret (JWT_SECRET)	If leaked, attacker can mint valid tokens
A6	Camera feed on the engineer's device	Could be exfiltrated by a malicious page

2. Trust Boundaries
[Engineer's Device]  ──TLS──▶  [Express Server]  ──┐
        │                                          │
        │ camera feed                              ▼
        ▼                                   [In-memory store]
[Physical QR markers]

Browser ⟷ Server — must be HTTPS in any non-localhost deployment.
Server ⟷ Storage — currently in-memory; would become DB in production.
Physical world ⟷ Camera — anyone can print a QR.


3. STRIDE Analysis
S — Spoofing
#	Threat	Risk	Mitigation in prototype	Production hardening
S1	Attacker prints a fake QR with FAULT-101 to mislead engineers	High	All QR payloads are validated against a server-side registry (/api/faults/:id). Unknown IDs render an explicit "Unknown Marker" warning instead of silently displaying anything	Sign QR payloads (e.g. JWS) so the scanner only accepts QRs cryptographically signed by the maintenance authority
S2	Attacker submits stolen/guessed credentials	High	Server uses bcrypt.compare (constant-ish time) and returns generic Invalid credentials to avoid username enumeration	MFA, account lockout, audit log of failed logins, SSO with corporate IdP
S3	Attacker spoofs the server (phishing the engineer)	Medium	N/A in prototype	HSTS, certificate pinning on the engineer-issued device, internal-only DNS for the dashboard
T — Tampering
#	Threat	Risk	Mitigation in prototype	Production hardening
T1	Attacker modifies the JWT to elevate role	High	Tokens are signed with HS256 and a 256-bit secret (crypto.randomBytes(32)). Any tamper invalidates the signature	Move to RS256 with rotating keys; keep secret in a secrets manager (AWS Secrets Manager / Vault)
T2	Attacker tampers with API responses on the wire	High	N/A on plain HTTP. TLS would prevent on-path modification	Enforce HTTPS in production; HSTS preload
T3	Attacker tampers with localStorage to forge a session	Medium	The token is signed — local edits are detected and rejected by the server	Use HTTP-only Secure cookies for the token instead of localStorage to remove XSS exfiltration
R — Repudiation
#	Threat	Risk	Mitigation in prototype	Production hardening
R1	Engineer denies confirming a fault	Medium	N/A in prototype	Append-only audit log of every authenticated API call (user, IP, action, timestamp); signed log entries
R2	Tool/inspection records are repudiated	Medium	N/A in prototype	Per-action digital signatures by the engineer's device-bound key
I — Information Disclosure
#	Threat	Risk	Mitigation in prototype	Production hardening
I1	Eavesdropper reads fault data on the wire	High	All fault endpoints require a Bearer token; data is JSON only (no HTML injection vector)	TLS in transit; encryption at rest for the DB
I2	Generic error messages leak which usernames exist	Medium	Login deliberately returns the same message + runs bcrypt on a dummy hash for unknown users to equalise timing	Rate-limit /login, log anomalous attempts
I3	XSS exfiltrates the JWT from localStorage	High	All dashboard content is escaped via an escapeHtml helper; no innerHTML on untrusted data	Move token to HTTP-only cookie; add a strict CSP (default-src 'self'); enable Trusted Types
D — Denial of Service
#	Threat	Risk	Mitigation in prototype	Production hardening
D1	Brute-force or flood of /login	Medium	JSON body size capped at 32 KB	express-rate-limit, fail2ban-style temp bans, CAPTCHA after N failures
D2	Attacker spams /api/faults/:id lookups via a malicious QR	Low	Scanner caches lookups per ID, so repeated detections of the same QR don't refetch	Per-token rate limits, server-side LRU cache
D3	Camera permission abuse on a shared device	Low	Camera only starts when the engineer presses Start Camera	Auto-stop the stream after inactivity; require re-auth
E — Elevation of Privilege
#	Threat	Risk	Mitigation in prototype	Production hardening
E1	Unauthenticated user reaches scanner / dashboard	High	Both pages call Auth.requireAuth() on load and redirect to /login.html; the API also rejects without a valid Bearer token (defence in depth)	Same — never trust client-side checks alone
E2	Engineer escalates to admin	Medium	Role is encoded inside the signed JWT and not editable by the client	RBAC enforced per route; admin-only endpoints behind requireRole('admin') middleware
E3	Token replay after logout	Medium	Tokens expire after 2 hours (TOKEN_TTL)	Short-lived access tokens + refresh tokens; server-side token revocation list


4. Residual Risks (Accepted for TRL 3)
No HTTPS in local dev (acceptable for localhost only).
Single in-memory user — no real user provisioning, password reset, MFA.
No persistent audit log — observability is console.log only.
No CSP / SRI on the CDN-loaded jsQR library.
These are explicitly out of scope for a TRL 3 proof of concept and would be addressed before any pilot deployment in a live transport environment.


5. Mapping to Coursework Objectives
Coursework requirement	Where addressed
Authentication and access control	/login (bcrypt + JWT) and Auth.requireAuth on protected pages
Protection of system communications	Bearer-token APIs, JSON-only payloads, escape-on-render in dashboard
Reduce risk of interference from threat actors	Server-side QR registry validation (S1), tamper-evident tokens (T1, T3), explicit "unknown marker" UX
Secure interaction between AR devices and the central dashboard	Same JWT secures both /api/faults/:id (scanner) and /api/faults (dashboard)
