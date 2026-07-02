<div align="center">

# @omadia/integration-bexio

### Let your agents answer questions from Bexio — allow-listed, cached, read-only.

A **Bexio** (Swiss SME accounting / ERP / CRM) integration for
[omadia](https://omadia.ai). It connects your Bexio account to your omadia
agents: a shared, allow-listed Bexio REST client is published to the service
registry, and read-only tools let agents answer questions about contacts,
invoices, quotes, orders, items, and projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bexio](https://img.shields.io/badge/Bexio-API-1AB394.svg)](#bexio-setup-one-time)
[![Read-only](https://img.shields.io/badge/writes-none-brightgreen.svg)](#the-tools)

[**omadia**](https://github.com/byte5ai/omadia) · [**Website**](https://omadia.ai) · [**Setup**](#bexio-setup-one-time) · [**Tools**](#the-tools) · [**Build**](#build--install)

</div>

---

Auth is a **Bexio Personal Access Token (PAT)** used directly as a bearer token
— no interactive sign-in, no OAuth round-trip, no refresh. A PAT is issued at
[developer.bexio.com/pat](https://developer.bexio.com/pat).

---

## How it works

| Concern | Implementation |
|---|---|
| Kind | `integration` — publishes services + contributes tools; it is not a channel. |
| Transport | REST over HTTPS, exclusively through the host-provided `ctx.http` (manifest `network.outbound` allow-list + per-plugin rate limit). |
| Auth | Bexio Personal Access Token sent as `Authorization: Bearer <token>`. No token endpoint, no OAuth, no refresh. |
| Services | `bexio.client` → `BexioClient`, `bexio.cache` → `BexioResponseCache`. Resolve via `ctx.services.get(...)`. |
| Tools | Read-only, always on: `bexio_contacts`, `bexio_invoices`, `bexio_quotes`, `bexio_orders`, `bexio_items`, `bexio_projects` (each: free-text `search`, raw `criteria`, or plain list) + `bexio_get` (fetch one record by id). |
| Safety | Responses are size-capped (`bexio_max_bytes`) before `JSON.parse`; no create/update/delete request is ever issued — read-only by construction; reads cached with a short TTL. |
| Lifecycle | `export async function activate(ctx): Promise<BexioPluginHandle>`. |

Source map:

```
src/
├── plugin.ts             # activate(ctx) — builds the client, publishes services, registers tools
├── bexioClient.ts        # PAT bearer REST client (list/search/get/permissions), size-capped, error taxonomy
├── bexioResponseCache.ts # short-TTL in-process read cache
├── resources.ts          # allow-list registry (contact, kb_invoice, kb_offer, kb_order, article, pr_project)
├── resourceTools.ts      # factory for the six per-resource read tools
└── getTool.ts            # `bexio_get` — generic single-record fetch by id
```

---

## Bexio setup (one-time)

1. Go to [developer.bexio.com/pat](https://developer.bexio.com/pat) and sign in
   with your Bexio account.
2. Create a new **Personal Access Token**, name it (e.g. "omadia"), and copy the
   token **value** immediately — it is shown only once.
3. Install the plugin and paste the token into the **API Token** field (or set
   the `BEXIO_API_TOKEN` env var).

Install verifies the connection in the background with a `GET /3.0/permissions`
call — watch the plugin logs for `connected` or a `permissions probe failed`
warning.

> A PAT carries your account's **full default scopes** and is valid for **6
> months**. Note the expiry and re-issue before it lapses; revoke any time on
> the same page. For scoped, least-privilege access, Bexio's OAuth2
> authorization-code flow would be required — it is intentionally **out of scope**
> for this read-only MVP.

### Setup fields

The field keys map 1:1 to `BEXIO_*` environment variables (omadia loads plugin
config from the host `.env` by the uppercased key).

| Field | Env var | Default | Purpose |
|---|---|---|---|
| `bexio_api_token` | `BEXIO_API_TOKEN` | _(required, secret)_ | Personal Access Token from developer.bexio.com/pat. Vault-stored. |
| `bexio_base_url` | `BEXIO_BASE_URL` | `https://api.bexio.com` | API base — only change for a proxy/sandbox. |
| `bexio_max_bytes` | `BEXIO_MAX_BYTES` | `1048576` | Hard cap on a single response body (1 MiB). |
| `bexio_cache_ttl_seconds` | `BEXIO_CACHE_TTL_SECONDS` | `60` | TTL for the in-process read cache. |

---

## The tools

All seven tools are **read-only** — there is no write path. Each of the six
resource tools accepts either a free-text `search`, a raw `criteria` array, or a
plain paginated list.

### Resource tools

| Tool | Bexio resource | Free-text `search` matches |
|---|---|---|
| `bexio_contacts` | `2.0/contact` | `name_1`, `name_2`, `mail` |
| `bexio_invoices` | `2.0/kb_invoice` | `title`, `document_nr` |
| `bexio_quotes` | `2.0/kb_offer` | `title`, `document_nr` |
| `bexio_orders` | `2.0/kb_order` | `title`, `document_nr` |
| `bexio_items` | `2.0/article` | `intern_name`, `intern_code` |
| `bexio_projects` | `2.0/pr_project` | `name`, `nr` |

```jsonc
// Free-text search (maps to a Bexio "like" criterion on the first search field)
{ "search": "Muster AG", "limit": 10 }

// Raw criteria — exact / AND queries (Bexio POST /{resource}/search)
{ "criteria": [{ "field": "name_1", "value": "Muster AG", "criteria": "=" }] }

// Plain list, newest first, paged
{ "order_by": "id_desc", "limit": 25, "offset": 0 }
```

`criteria` operators: `=`, `equal`, `!=`, `not_equal`, `>`, `<`, `>=`, `<=`,
`like` (default), `not_like`, `is_null`, `not_null`, `in`, `not_in`. Each tool
returns up to 100 rows as compact JSON (`{ resource, op, count, records,
truncated }`).

### `bexio_get`

Fetch a single record by `id` from an allow-listed resource:

```jsonc
{ "resource": "kb_invoice", "id": 42 }
```

`resource` is guarded against the allow-list (`contact`, `kb_invoice`,
`kb_offer`, `kb_order`, `article`, `pr_project`) — anything else returns a clear
error instead of reaching an arbitrary endpoint.

---

## Consuming the client from another plugin

```ts
import type { BexioClient } from '@omadia/integration-bexio';

const bexio = ctx.services.get<BexioClient>('bexio.client');
if (!bexio) {
  // integration not installed — degrade gracefully
}
const openInvoices = await bexio.search(
  'kb_invoice',
  [{ field: 'kb_item_status_id', value: 9, criteria: '=' }],
  { limit: 20 },
);
```

---

## Build & install

Requires Node ≥ 20 (pinned in `.nvmrc`).

```bash
nvm use
npm install
npm run typecheck   # tsc gate (see "Typecheck" below)
npm test            # node --test — unit tests for the client, cache, resources, tools
npm run build       # esbuild-bundles src/plugin.ts → dist/plugin.js, then zips
# → out/omadia-integration-bexio-0.2.0.zip
```

Install the resulting ZIP:

- **Local / smoke:** Admin UI → *Store → Lokal → Upload* → drop the `.zip`.
- **Hub:** publish to the registry (`scripts/publish.mjs`), then *Store → Hub →
  install*.

### Typecheck

`tsconfig.json` resolves `@omadia/plugin-api` types via `paths`, pointing at an
adjacent omadia checkout (`../odoo-bot/middleware/packages/plugin-api/dist`).
Point it at wherever your built `@omadia/plugin-api` type declarations live —
this package is not published to npm. The esbuild build does not need it
(`@omadia/plugin-api` is `external`, provided by the host at runtime).

## Limitations & caveats

- **Read-only.** This version issues no create/update/delete request. Writes are
  a deliberate future feature, not part of this MVP.
- **PAT scope & expiry.** A Personal Access Token has the account's full default
  scopes and expires after 6 months — rotate it before it lapses. Scoped,
  least-privilege access needs Bexio's OAuth2 flow (out of scope here).
- **Rate limit.** Bexio enforces a per-minute request limit; a `429` surfaces as
  a clear error carrying the `RateLimit-Reset` retry hint.
- **Single account per install.** One PAT → one Bexio account per plugin instance.

## License

MIT © byte5 GmbH
