# Amal Foundation Platform — Deployment Guide

**Version:** 1.1 · **Date:** 2026-07-17 · **Governance:** ADR-007 (Docker on VPS), ADR-024 (RPO/RTO), ADR-025 (Nginx + Let's Encrypt), Constitution Art. 9

This guide covers deploying the ERP core to a VPS. Environments are isolated: **dev → test → staging → production** (Art. 9.1); each has its own VPS (or isolated compose project), its own `.env`, and its own database. Nothing is ever changed manually in a production database (Art. 3.6).

## 1. Prerequisites

A VPS running a current Ubuntu/Debian LTS with Docker Engine + Compose v2, at least 4 GB RAM (8 GB recommended for production), and a DNS record for the API host. **The production edge is fixed by ADR-025: Nginx reverse proxy with Let's Encrypt TLS** (certbot auto-renewal), proxying 443 → `127.0.0.1:3000`. Nginx handles HTTP→HTTPS redirect, HSTS, proxy headers (`X-Forwarded-For/Proto` — the app runs `trust proxy`), and an upload body-size limit (`client_max_body_size` matching the storage module's cap). PostgreSQL, Redis and MinIO are never publicly exposed (internal Docker network only — enforced by the compose file).

Minimal Nginx site (ADR-025):

```nginx
server {
  listen 443 ssl http2;
  server_name api.amal.org;
  ssl_certificate     /etc/letsencrypt/live/api.amal.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.amal.org/privkey.pem;
  add_header Strict-Transport-Security "max-age=31536000" always;
  client_max_body_size 25m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server { listen 80; server_name api.amal.org; return 301 https://$host$request_uri; }
```

## 2. First deployment

```bash
git clone <repo> /opt/amal/erp-core && cd /opt/amal/erp-core
cp .env.example .env            # fill EVERY value; validation refuses defaults in production
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy   # also runs at container start
docker compose -f docker-compose.prod.yml exec api npm run prisma:seed        # permissions, roles, bootstrap admin
```

The production compose exposes only the API, bound to `127.0.0.1:3000`. PostgreSQL, Redis, and MinIO are reachable solely on the internal Docker network (Art. 3.4: no external direct database access).

Required `.env` values beyond the development template: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `CORS_ORIGINS` (explicit origins, comma-separated — the app refuses to boot with a wildcard), strong `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (≥ 24 chars), and a non-default `SEED_ADMIN_PASSWORD`. `RECEIPT_FONT_PATH` must point to an Arabic-capable TTF for receipt rendering (ADR-020).

## 3. Releases

Releases deploy from tagged images built by CI (`.github/workflows/ci.yml`: lint → typecheck → tests → build → migration check → image build). On the VPS:

```bash
cd /opt/amal/erp-core && git fetch --tags && git checkout <tag>
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api    # container start runs `prisma migrate deploy`
curl -fsS http://127.0.0.1:3000/health/ready
```

**Rollback (Art. 9.1):** re-checkout the previous tag and `up -d api`. Migrations are forward-only in production; a bad migration is corrected by a new forward migration, never by editing an applied one (Art. 3.6). If data was damaged, restore from backup per the Backup & DR document and re-apply.

## 4. Post-deployment checklist

`/health/ready` returns 200 through Nginx over HTTPS; `/monitoring` (super admin) shows every queue with a worker attached and zero paused queues; Swagger is unreachable publicly (`SWAGGER_ENABLED=false`); logging in with the seeded admin forces an immediate password change and the login appears in `audit/logs`; a test file upload lands in MinIO (never in PostgreSQL — Art. 3.5); backup cron entries exist (`ops/crontab.example`) and the first `pg_backup.sh daily` run succeeds; **WAL archiving is active and a forced WAL switch appears at the off-site target within the hour (ADR-024 RPO gate)**; certbot renewal timer is active (`systemctl list-timers | grep certbot`); the institutional WhatsApp number is stored as a configuration setting (`communication.whatsapp_number` — ADR-023), not hard-coded anywhere.

## 5. Environment isolation rules

Staging mirrors production topology (same compose file, different host/env). Test data never flows into production; production dumps may flow down only after sensitive-field scrubbing (phones, addresses, national ids, medical documents — Art. 6.2). Each environment has distinct JWT secrets, so tokens can never cross environments.
