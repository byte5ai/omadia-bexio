# Changelog

## 0.3.0

- Manifest: every tool (`bexio_contacts`, `bexio_invoices`, `bexio_quotes`, `bexio_orders`, `bexio_items`, `bexio_projects`, `bexio_get`) now has a `capabilities:` entry with `side_effects: read` (spec 2042 plugin boundary; the kernel reads tool effects from the manifest).
- `compat.core` is now `>=1.75.0 <2.0`.
- Audit: no model access, no persona/AGENT.md; all network goes through `ctx.http` (`api.bexio.com` allow-listed). No code change.
