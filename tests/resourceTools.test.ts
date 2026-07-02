// tests/resourceTools.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BexioClient } from '../src/bexioClient.ts';
import { BexioResponseCache } from '../src/bexioResponseCache.ts';
import { makeResourceTool, RESOURCE_TOOLS } from '../src/resourceTools.ts';

const okFetch = (rows: unknown[], sink?: (u: string, i?: any) => void): typeof fetch =>
  (async (u: any, i?: any) => { sink?.(String(u), i); return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } }); }) as any;

test('search term maps to a like criterion on the first search field (POST /search)', async () => {
  let url = '';
  const client = new BexioClient({ apiToken: 't', fetch: okFetch([{ id: 1 }], (u) => (url = u)) });
  const cache = new BexioResponseCache({ ttlMs: 0 });
  const { spec, handler } = makeResourceTool('contact', { name: 'bexio_contacts', description: 'd', promptDoc: 'p' }, client, cache);
  assert.equal(spec.name, 'bexio_contacts');
  const out = JSON.parse(await handler({ search: 'Muster' }) as string);
  assert.ok(url.includes('/2.0/contact/search'), url);
  assert.equal(out.resource, 'contact');
  assert.equal(out.count, 1);
});

test('no search/criteria → plain list (GET)', async () => {
  let url = '';
  const client = new BexioClient({ apiToken: 't', fetch: okFetch([{ id: 1 }, { id: 2 }], (u) => (url = u)) });
  const cache = new BexioResponseCache({ ttlMs: 0 });
  const { handler } = makeResourceTool('article', { name: 'bexio_items', description: 'd', promptDoc: 'p' }, client, cache);
  const out = JSON.parse(await handler({ limit: 2 }) as string);
  assert.ok(url.includes('/2.0/article?'), url);
  assert.equal(out.count, 2);
});

test('bexio_orders is registered and reads kb_order (GET /2.0/kb_order)', async () => {
  const t = RESOURCE_TOOLS.find((x) => x.name === 'bexio_orders');
  assert.ok(t && t.key === 'kb_order', 'bexio_orders → kb_order registered');
  let url = '';
  const client = new BexioClient({ apiToken: 't', fetch: okFetch([{ id: 5 }], (u) => (url = u)) });
  const cache = new BexioResponseCache({ ttlMs: 0 });
  const { handler } = makeResourceTool('kb_order', { name: 'bexio_orders', description: 'd', promptDoc: 'p' }, client, cache);
  const out = JSON.parse(await handler({}) as string);
  assert.ok(url.includes('/2.0/kb_order?'), url);
  assert.equal(out.resource, 'kb_order');
  assert.equal(out.count, 1);
});
