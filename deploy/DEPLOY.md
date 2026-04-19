# Deploying url-utilities-admin

## Prerequisites

- Kubernetes cluster (homelab is fine) with an ingress controller if you want external access
- Helm 3+
- A running `url-utilities` core (v2.2.0+) reachable from the cluster — typically as a Service in the same or a neighbouring namespace
- Access to pull `ghcr.io/ralton-dev/url-utilities-admin` (public by default)

## 1. Create a per-instance values file

```bash
cp deploy/helm/url-utilities-admin/values.yaml deploy/helm/url-utilities-admin/values-prod.yaml
```

Edit `values-prod.yaml`:

- `image.tag` — pin to a released tag like `v0.1.0` (or `v0.1.0-<sha>`)
- `config.CORE_URL` — in-cluster URL of the core, e.g. `http://url-utilities-prod.url-utilities-prod.svc.cluster.local:80`
- `secrets.CORE_API_KEY` — must match `API_KEY` on the core. Or set `secrets.existingSecret` to a pre-materialized Secret name (see [SECRETS.md](./SECRETS.md))
- `ingress.enabled: true`, fill `ingress.hosts`, `ingress.tls`, and any annotations — only if you want external access. For a homelab admin tool, leaving ingress disabled + port-forwarding is often enough and more secure

`values-*.yaml` is already ignored by `.gitignore` — treat these files as secrets even when using `existingSecret`, since they still carry operational config.

## 2. Install

```bash
make helm-install REPO=prod
# → helm upgrade --install url-utilities-admin-prod deploy/helm/url-utilities-admin \
#      --namespace url-utilities-admin-prod --create-namespace \
#      -f deploy/helm/url-utilities-admin/values-prod.yaml
```

There is **no** migration Job — the admin UI has no database of its own.

## 3. Verify

```bash
kubectl -n url-utilities-admin-prod rollout status deploy/url-utilities-admin-prod
kubectl -n url-utilities-admin-prod port-forward svc/url-utilities-admin-prod 4000:80
curl http://localhost:4000/api/health    # {"status":"ok"}
curl http://localhost:4000/api/ready     # 200 if core reachable, 503 otherwise
open http://localhost:4000/urls          # open the UI in a browser
```

## Upgrading

```bash
# bump chart + app version, tag, push
make bump-version VERSION_ARG=0.2.0
git push origin main --tags
# the Release workflow builds and pushes ghcr.io/ralton-dev/url-utilities-admin:v0.2.0
# then re-install from the new tag
make helm-install REPO=prod
```

If the core's admin endpoint shapes change, bump both sides in lockstep — this repo's `docs/core-admin-endpoints.md` is the source of truth for the contract.

## Rollback

```bash
helm -n url-utilities-admin-prod history url-utilities-admin-prod
helm -n url-utilities-admin-prod rollback url-utilities-admin-prod <revision>
```

Safe to roll back freely — no schema to reverse.
