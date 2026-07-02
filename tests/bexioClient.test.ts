// tests/bexioClient.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BexioClient, BexioAuthError, BexioRateLimitError, BexioApiError } from '../src/bexioClient.ts';

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: any, init?: any) => handler(String(input), init)) as unknown as typeof fetch;
}
const ok = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

test('list() builds GET with order_by/limit/offset and returns array', async () => {
  let seen = '';
  const client = new BexioClient({ apiToken: 't', fetch: fakeFetch((url) => { seen = url; return ok([{ id: 1 }]); }) });
  const rows = await client.list('contact', { limit: 5, offset: 10, orderBy: 'name_1' });
  assert.deepEqual(rows, [{ id: 1 }]);
  assert.ok(seen.startsWith('https://api.bexio.com/2.0/contact?'), seen);
  assert.match(seen, /order_by=name_1/);
  assert.match(seen, /limit=5/);
  assert.match(seen, /offset=10/);
});

test('search() POSTs the criteria array to /search', async () => {
  let body = '';
  const client = new BexioClient({ apiToken: 't', fetch: fakeFetch((url, init) => {
    body = String(init?.body ?? ''); assert.ok(url.endsWith('/2.0/contact/search'), url); return ok([{ id: 2 }]);
  }) });
  const rows = await client.search('contact', [{ field: 'name_1', value: 'Muster' }]);
  assert.deepEqual(rows, [{ id: 2 }]);
  assert.deepEqual(JSON.parse(body), [{ field: 'name_1', value: 'Muster', criteria: 'like' }]);
});

test('get() fetches a single record by id', async () => {
  const client = new BexioClient({ apiToken: 't', fetch: fakeFetch((url) => { assert.ok(url.endsWith('/2.0/kb_invoice/7'), url); return ok({ id: 7 }); }) });
  assert.deepEqual(await client.get('kb_invoice', 7), { id: 7 });
});

test('sets the PAT bearer header', async () => {
  let auth: string | null = null;
  const client = new BexioClient({ apiToken: 'secret-pat', fetch: fakeFetch((_u, init) => {
    auth = new Headers(init?.headers).get('authorization'); return ok([]);
  }) });
  await client.list('article');
  assert.equal(auth, 'Bearer secret-pat');
});

test('401 → BexioAuthError, 429 → BexioRateLimitError(retryAfter), 500 → BexioApiError', async () => {
  const mk = (status: number, headers: Record<string, string> = {}) =>
    new BexioClient({ apiToken: 't', fetch: fakeFetch(() => new Response('{"message":"nope"}', { status, headers: { 'content-type': 'application/json', ...headers } })) });
  await assert.rejects(() => mk(401).list('contact'), (e) => e instanceof BexioAuthError);
  await assert.rejects(() => mk(429, { 'ratelimit-reset': '30' }).list('contact'), (e) => e instanceof BexioRateLimitError && (e as BexioRateLimitError).retryAfterSeconds === 30);
  await assert.rejects(() => mk(500).list('contact'), (e) => e instanceof BexioApiError && (e as BexioApiError).status === 500);
});

test('rejects a body larger than maxBytes before parse', async () => {
  const big = 'x'.repeat(2000);
  const client = new BexioClient({ apiToken: 't', maxBytes: 1000, fetch: fakeFetch(() => new Response(`["${big}"]`, { status: 200, headers: { 'content-type': 'application/json' } })) });
  await assert.rejects(() => client.list('contact'), /exceeded/);
});
