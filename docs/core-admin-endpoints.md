# Admin endpoints spec — `url-utilities` core

**Audience:** the agent implementing these endpoints in the `url-utilities` core repo.
**Consumer:** `url-utilities-admin` (this repo). Every shape below is load-bearing; changing them is a cross-repo breaking change.

---

## Context

The admin UI is a headless-UI operator tool that lists, searches, edits, and deletes shortened URLs, shows click totals, and regenerates QR codes. It talks to the core **only** over HTTP — no direct Postgres. The existing `POST /api/url`, `POST /api/qr`, and `GET /r/:alias` routes stay unchanged. Everything below is new, under the `/api/admin/` prefix.

## Conventions

- **Auth:** every endpoint requires the shared `x-api-key` header. Reuse `requireApiKey` from `src/plugins/auth.ts` as a `preHandler`. The admin UI sends the same `API_KEY` the write endpoints accept today (homelab-scale; a scoped admin key is future work — see open questions).
- **Success envelope:** `{ "success": true, "data": <payload> }`. Slightly more structured than the current `{ success: true, url: ... }` because list/detail need nested payloads. Keeps the success/errors pairing already in use.
- **Failure envelope:** unchanged — `{ "success": false, "errors": string[] | Record<string, string[]> }`. Array for flat errors; `fieldErrors` map from Zod for validation.
- **Status codes:** `200` on read/update, `204` on delete, `400` on validation, `401` on auth, `404` on not-found, `409` on conflict, `422` on business-logic failure.
- **Alias format:** 10-char alphanumeric per the existing `customAlphabet` in `src/utils/upsertUrl.ts`. Validate the `:alias` path param with `z.string().regex(/^[0-9A-Za-z]{10}$/)`.

---

## Endpoints

### 1. `GET /api/admin/urls` — list / search / paginate

**Query params** (all optional):

| Param      | Type       | Default      | Notes                                                                                                         |
| ---------- | ---------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `q`        | string     | —            | Free-text match; `ILIKE '%q%'` across `alias` and `url`                                                       |
| `page`     | int ≥ 1    | `1`          | 1-indexed                                                                                                     |
| `pageSize` | int 1..100 | `20`         | Hard cap at 100                                                                                               |
| `sort`     | enum       | `-createdAt` | One of `createdAt`, `-createdAt`, `alias`, `-alias`, `count`, `-count`, `url`, `-url`. Leading `-` means desc |
| `minCount` | int ≥ 0    | —            | Inclusive lower bound on `count`                                                                              |
| `maxCount` | int ≥ 0    | —            | Inclusive upper bound on `count`                                                                              |

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
        "alias": "aZ9xK2pQ0b",
        "url": "https://example.com/very/long/path",
        "count": 137,
        "createdAt": "2026-04-19T10:15:30.000Z"
      }
    ],
    "total": 421,
    "page": 1,
    "pageSize": 20
  }
}
```

Do **not** include `qrCode` in list items — it would balloon the payload.

### 2. `GET /api/admin/urls/:alias` — detail

**Response 200:**

```json
{
  "success": true,
  "data": {
    "id": 42,
    "alias": "aZ9xK2pQ0b",
    "url": "https://example.com/path",
    "count": 137,
    "createdAt": "2026-04-19T10:15:30.000Z",
    "qrCode": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

`qrCode` is `null` if no `qr_codes` row exists for this URL yet.

**Response 404:** `{ "success": false, "errors": ["Not found"] }`

### 3. `PATCH /api/admin/urls/:alias` — update destination

Only the `url` field is mutable in v1. Alias renames are intentionally out of scope (they would invalidate every distributed short link).

**Body:** `{ "url": "https://new-destination.example.com" }`
Re-validate with the same rule `POST /api/url` uses: `z.string().trim().url()`.

**Response 200:** updated detail payload (same shape as endpoint 2).
**Response 400:** `{ success: false, errors: { url: ['Invalid url'] } }`
**Response 404:** not found.

### 4. `DELETE /api/admin/urls/:alias`

Delete the URL row and any `qr_codes` row referencing it, in a single transaction.

**Response 204** (no body) on success.
**Response 404** if the alias doesn't exist.

### 5. `POST /api/admin/urls/:alias/qr/regenerate`

Re-render the QR data URL from the alias's redirect URL (`${APP_URL}/r/:alias`) and upsert into `qr_codes`. Reuse the same `qrcode` library and settings as `POST /api/qr` (`errorCorrectionLevel: 'H'`).

**Response 200:**

```json
{ "success": true, "data": { "qrCode": "data:image/png;base64,..." } }
```

**Response 404** if the alias doesn't exist.

### 6. `GET /api/admin/stats`

Lightweight aggregate stats for the dashboard.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "totalUrls": 421,
    "totalClicks": 15234,
    "topUrls": [
      {
        "alias": "aZ9xK2pQ0b",
        "url": "https://...",
        "count": 2111,
        "createdAt": "2026-03-15T09:02:11.000Z"
      }
    ]
  }
}
```

`topUrls` = top 10 by `count desc`.

---

## Required schema change

The current `urls` table has no created-date column. Add one:

```ts
// src/db/schema.ts
export const urls = pgTable('urls', {
  id: serial('id').primaryKey(),
  url: text('url'),
  alias: varchar('alias', { length: 10 }),
  count: integer('count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Generate a new migration with `npm run drizzle-kit:push` (or `drizzle-kit generate`) and ship it under `src/db/migrations/`. The pre-sync migrate Job wired into the chart applies it on the next release. Existing rows get `now()` as the backfill value on `ALTER TABLE ... ADD COLUMN ... DEFAULT now() NOT NULL` — that's accepted as "≈ when the admin UI first rolled out".

---

## Implementation notes

- **File layout:** add `src/routes/admin.ts` and register it from `src/app.ts` next to the existing routes. If it crosses ~200 lines, split into `src/routes/admin/urls.ts` and `src/routes/admin/stats.ts`.
- **Validation:** new schemas in `src/validation/admin.ts` — `adminListQuery`, `adminUpdateBody`, `aliasParam`. Reuse the URL validator from `src/validation/url.ts` where possible.
- **Pagination total:** run `count(*)` as a second query, not a windowed subquery — cheaper on Postgres at this scale.
- **QR size:** data URLs are ~2–5 KB per row. The detail endpoint bundling `qrCode` is fine; omit it from list responses.
- **Tests:** add `tests/admin.test.ts` covering each endpoint's happy path + auth + validation + pagination. Reuse `makeApp`/`resetDb` from `tests/helpers.ts` and the existing testcontainers Postgres in `tests/globalSetup.ts`.

---

## Cross-repo version coupling

- Bump core `appVersion` to **`2.2.0`** (minor — additive endpoints + additive column, backward-compatible).
- This repo's README will pin a minimum core version. If any shape above needs to change later, bump both sides.

---

## Open questions for Ben (please confirm before implementation)

1. **`createdAt` column** — add it now as above? **Recommended: yes.** The UI needs it for sort + display. Additive, low-risk.
2. **`qr_codes` population** — lazy-populate on detail read (first detail view generates + persists), or keep it strictly opt-in and only fill on explicit regenerate (endpoint 5)? **Recommended: lazy populate on detail read.** Simpler for the UI.
3. **Alias rename** — out of scope for v1?
4. **Scoped admin key** — reuse the existing shared `API_KEY`, or add a second `ADMIN_API_KEY` now with a middleware change to accept either? **Recommended: reuse for v1.** Homelab, one operator.

---

## Minimal acceptance criteria

- All six endpoints implemented, 401 without auth, shapes match exactly.
- `created_at` column added, migration applied by the pre-sync Job.
- `tests/admin.test.ts` green under the existing testcontainers pattern.
- Release tagged `v2.2.0`; GHCR image built by the existing release workflow.
