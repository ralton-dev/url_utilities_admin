# Secrets handling

The chart takes one secret — `CORE_API_KEY` — and supports two modes for providing it.

## Mode A: bootstrap (plaintext in values)

Set `secrets.CORE_API_KEY` directly in your `values-<slug>.yaml`. The chart renders an Opaque `Secret` named after the release.

Fastest path for a first deploy, but the values file now contains a real credential — do not commit it.

## Mode B: existing secret (recommended for ongoing use)

Create the Secret out-of-band (via sealed-secrets, external-secrets, SOPS, or a `kubectl create secret` piped from a vault-fetched file), then point the chart at it:

```yaml
secrets:
  existingSecret: url-utilities-admin-prod-secrets
  # CORE_API_KEY is ignored when existingSecret is set
```

The Secret must expose key `CORE_API_KEY`.

### Example: sealed-secrets

```bash
kubectl create secret generic url-utilities-admin-prod-secrets \
  --namespace url-utilities-admin-prod \
  --from-literal=CORE_API_KEY="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml \
  | kubeseal --controller-namespace sealed-secrets --format yaml \
  > deploy/helm/url-utilities-admin/sealed/url-utilities-admin-prod-secrets.yaml

kubectl apply -f deploy/helm/url-utilities-admin/sealed/url-utilities-admin-prod-secrets.yaml
# Then install with secrets.existingSecret=url-utilities-admin-prod-secrets
```

## Keeping the admin key in sync with the core

The admin UI's `CORE_API_KEY` must equal the core's `API_KEY`. Any rotation is a two-step:

1. Update the core's Secret first (or both simultaneously). The core will accept only the new key.
2. Update the admin UI's Secret and restart the pod.

If you want zero-downtime rotation, you'll need the core to accept multiple keys — that's a core-side change, not an admin-UI one. Track it in the core repo.
