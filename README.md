# url-utilities-admin

Admin UI for the [`url-utilities`](https://github.com/ralton-dev/url-utilities) URL shortener. A tiny Fastify + HTMX server that renders HTML pages for listing, searching, editing, deleting, and generating QR codes for shortened URLs.

- Pairs with `url-utilities` ≥ **v2.2.0** (which adds the `/api/admin/*` endpoints this UI consumes)
- Deliberately lean: no SPA bundler, no client-side router — HTMX swaps partials against Fastify-rendered EJS
- Runs headless in a homelab Kubernetes cluster; auth is delegated to the ingress / network (no app login)

## Features (v1)

- List all shortened URLs with search, sort, and pagination
- Create a new short URL
- View per-URL detail: destination, click count, created date, QR code
- Edit the destination URL (alias is immutable — rename would invalidate shared links)
- Delete a URL and its QR code
- Regenerate a QR code
- Dashboard with totals + top-clicked URLs

Out of scope for v1: user accounts, API-key management, alias renames.

## Requirements

- Node.js 22+ (for dev)
- A running `url-utilities` core reachable over HTTP, with the admin endpoints from [`docs/core-admin-endpoints.md`](./docs/core-admin-endpoints.md) implemented (tracked as core v2.2.0)

## Quick start (local)

```bash
git clone https://github.com/ralton-dev/url_utilities_admin.git
cd url_utilities_admin
npm install
cp .env.example .env.local
# edit .env.local: point CORE_URL at a running core, set CORE_API_KEY
npm run dev                # http://localhost:4000
```

Open `http://localhost:4000/urls`.

## Environment variables

| Variable       | Description                                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| `CORE_URL`     | URL of the `url-utilities` core, no trailing slash (e.g. `http://localhost:3000`)  |
| `CORE_API_KEY` | `x-api-key` value the admin UI sends to the core. Must match `API_KEY` on the core |
| `PORT`         | Port this admin server listens on (default `4000`)                                 |
| `LOG_LEVEL`    | `fatal` / `error` / `warn` / `info` / `debug` / `trace` (default `info`)           |

## Auth model

This is a homelab admin tool. It assumes the ingress (or a reverse-proxy SSO) fronts it and that only authorized operators reach the pod. The UI itself has no login. It still authenticates _outward_ to the core with `CORE_API_KEY` so the core stays protected even if the admin pod is compromised.

If this ever runs somewhere exposed to the public internet, put an auth layer in front of it — don't bolt one on here.

## How it talks to the core

The UI is a thin HTTP client over the core's `/api/admin/*` endpoints. It never touches Postgres directly. See [`docs/core-admin-endpoints.md`](./docs/core-admin-endpoints.md) for the exact shapes; those are a contract between the two repos.

## Docker

```bash
docker run --rm -p 4000:4000 \
  -e CORE_URL=http://host.docker.internal:3000 \
  -e CORE_API_KEY=change-me \
  ghcr.io/ralton-dev/url-utilities-admin:v0.1.0
```

A `linux/amd64` image is published to GHCR on every `v*` tag:

```
ghcr.io/ralton-dev/url-utilities-admin:v<version>
ghcr.io/ralton-dev/url-utilities-admin:v<version>-<short-sha>
```

## Kubernetes (Helm)

Chart at [`deploy/helm/url-utilities-admin/`](./deploy/helm/url-utilities-admin). Mirrors the core's layout:

- Non-root pod security context, read-only root FS
- Liveness probe at `/api/health`; readiness probe at `/api/ready` checks core reachability
- Optional Ingress and HPA
- Two secret modes: inline plaintext for bootstrap, or `existingSecret` for sealed-secrets

See [`deploy/DEPLOY.md`](./deploy/DEPLOY.md) and [`deploy/SECRETS.md`](./deploy/SECRETS.md) for the full walkthrough.

Quick install:

```bash
cp deploy/helm/url-utilities-admin/values.yaml deploy/helm/url-utilities-admin/values-prod.yaml
# edit values-prod.yaml (image.tag, config.CORE_URL, secrets.CORE_API_KEY, ingress)
make helm-install REPO=prod
```

## Scripts

| Script                          | What it does                           |
| ------------------------------- | -------------------------------------- |
| `npm run dev`                   | tsx watch — hot-reload dev server      |
| `npm run build`                 | tsc + copy views/ and public/ to dist/ |
| `npm start`                     | Run the built server (`node dist/...`) |
| `npm test`                      | Vitest (mocks the core with undici)    |
| `npm run lint`                  | ESLint                                 |
| `npm run format` / `format:fix` | Prettier check / write                 |

## License

MIT — see [LICENSE](./LICENSE).
