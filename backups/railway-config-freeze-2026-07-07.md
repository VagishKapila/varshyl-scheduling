# Railway deployment config — freeze 2026-07-07

**Project:** varshyl-scheduling (`2238a88e-2195-464a-bf47-a19fd156e6d5`)  
**Environment:** production (`24e94da2-e4ea-4abe-a96b-c43e274d2dfa`)  
**Service:** varshyl-scheduling (`ed426a53-59e5-4027-a484-cf2622b07e5e`)  
**Git freeze tag:** `v1-freeze-2026-07-07` → commit `1d9da06`

## Build & deploy settings (per handoff brief 2026-07-07)

| Setting | Value |
|---|---|
| **Builder** | **Railpack** (NOT Dockerfile — Dockerfile exists in repo but must not be selected) |
| **Start command** | none set (auto-detected) |
| **Build command** | none set (auto-detected) |
| **Root directory** | none / repo root (`null` in Railway dashboard) |

## Domains

| Type | Domain |
|---|---|
| Railway-provided | `varshyl-scheduling-production.up.railway.app` |
| Custom domains | none observed via Railway CLI at freeze time |

## Related services

| Service | Role |
|---|---|
| Postgres | Managed PostgreSQL (`ghcr.io/railwayapp-templates/postgres-ssl:18`), volume `postgres-volume` |
| varshyl-scheduling | Next.js app, GitHub repo `VagishKapila/varshyl-scheduling`, branch `main` |

## Observed deployment metadata (informational)

At freeze time, Railway deployment API reported `builder: DOCKERFILE` with `dockerfilePath: /Dockerfile` on recent deployments including `1d9da06`. The handoff brief specifies **Railpack** as the correct builder for rollback. After restoring code, confirm in Railway dashboard → Settings → Build that builder is **Railpack**, not Dockerfile.

## Critical post-rollback constraints

- Do **not** add `output: 'standalone'` to `next.config.js` — it breaks the Railpack deploy path.
- Keep builder on **Railpack** (not Dockerfile).
- Re-apply env vars listed in `env-keys-freeze-2026-07-07.txt` if the service is recreated.
