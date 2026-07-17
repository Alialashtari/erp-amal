# Amal Foundation Platform — Security Hardening Checklist

**Version:** 1.0 · **Date:** 2026-07-17 · **Governance:** Constitution Art. 6, ADR-016

## 1. Enforced by the application (verified in code)

Argon2 password hashing; JWT access + rotating refresh tokens with session/device tracking and forced logout (Art. 6.4). RBAC + mandatory server-side data scoping on every protected route via global guards — authentication and permission checks cannot be forgotten because they are the default (ADR-016). Sensitive fields (national ids, contacts, addresses, GPS) masked without `crm.view_sensitive`; financial-amount visibility and medical files carry independent permissions (Art. 6.2). Helmet security headers; global rate limiting; strict validation (`whitelist` + `forbidNonWhitelisted`) on every input (Art. 3.3). Upload safety: executables blocked, size caps, binaries only in MinIO, downloads via presigned URLs (Art. 3.5). Append-only audit with IP/device/old/new values; no update or delete path exists in the audit module (Art. 6.3). Production boot refuses default secrets, missing infrastructure variables, and wildcard CORS (env validation). Swagger UI disabled in production by default. Graceful shutdown enabled; `trust proxy` set so audit and throttling see real client IPs behind the TLS terminator.

## 2. Host checklist (operator, before go-live)

SSH: key-only auth, no root login, non-standard port or rate-limited (fail2ban). Firewall: only 80/443 (terminator) and SSH open; 3000 bound to localhost by compose; database/Redis/MinIO have **no** host ports. Automatic security updates enabled. Docker daemon not exposed. `.env` and `backup.env` permissions `600`, owned by the deploy user; secrets never in git (Art. 6.1). TLS: modern ciphers, HSTS at the terminator, certificate auto-renewal tested. Time synchronized (NTP) — audit timestamps and JWT expiry depend on it.

## 3. Operational security duties

Quarterly access review: role assignments against actual duties; separation kept between `finance.approve` and transaction creators (Art. 5.5 separation of duties is also enforced in code). Rotate JWT secrets and infrastructure passwords on staff departure or suspected compromise (rotation invalidates refresh tokens — communicate a re-login). Review `audit/logs` weekly for permission changes, exports, and failed-login clusters. Restore-test logs reviewed with the same seriousness as backups themselves. Integration accounts (when Phase 5B ships) must be scoped, rotated, rate-limited, and audited (Art. 8.5) — no shared human/machine accounts.

## 4. Known gaps and their owners

| Gap | Status | Owner / blocker |
|---|---|---|
| ~~TLS/gateway layer choice~~ | **Resolved: Nginx + Let's Encrypt (ADR-025)** — configure per Deployment Guide §1 | Operator (setup task) |
| ~~Real email/SMS alerting~~ | **Resolved by ADR-023: no providers in v1.0; institutional WhatsApp operated by staff; in-system recording preserved** | — |
| ~~Off-site backup destination~~ | **Targets fixed (ADR-024: RPO 1h/RTO 6h)**; operator records the off-site target in `backup.env` + enables WAL archiving | Operator (setup task) |
| Webhook signature verification | Designed (Art. 8.5), ships with first channel integration | Phase 5B |
| Penetration test before public channels go live | Not scheduled | Stakeholder |
