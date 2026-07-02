// tests/getTool.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BexioClient } from '../src/bexioClient.ts';
import { BexioResponseCache } from '../src/bexioResponseCache.ts';
import { createBexioGetTool } from '../src/getTool.ts';

const okFetch = (row: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(row), { status: 200, headers: { 'content-type': 'application/json' } })) as any;

test('rejects a resource outside the allow-list', async () => {
  const client = new BexioClient({ apiToken: 't', fetch: okFetch({}) });
  const { handler } = createBexioGetTool(client, new BexioResponseCache({ ttlMs: 0 }));
  const out = await handler({ resource: 'kb_bill', id: 1 }) as string;
  assert.match(out, /Error:.*resource/i);
});

test('fetches an allow-listed record by id', async () => {
  const client = new BexioClient({ apiToken: 't', fetch: okFetch({ id: 9, title: 'X' }) });
  const { handler } = createBexioGetTool(client, new BexioResponseCache({ ttlMs: 0 }));
  const out = JSON.parse(await handler({ resource: 'kb_invoice', id: 9 }) as string);
  assert.equal(out.record.id, 9);
});
