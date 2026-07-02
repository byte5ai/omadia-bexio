import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BexioResponseCache } from '../src/bexioResponseCache.ts';

test('caches within TTL, only calls producer once', async () => {
  const cache = new BexioResponseCache({ ttlMs: 1000 });
  let calls = 0;
  const produce = async () => { calls++; return { n: calls }; };
  const a = await cache.getOrSet('k', produce);
  const b = await cache.getOrSet('k', produce);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
});

test('clear() drops entries', async () => {
  const cache = new BexioResponseCache({ ttlMs: 1000 });
  let calls = 0;
  const produce = async () => { calls++; return calls; };
  await cache.getOrSet('k', produce);
  cache.clear();
  await cache.getOrSet('k', produce);
  assert.equal(calls, 2);
});
