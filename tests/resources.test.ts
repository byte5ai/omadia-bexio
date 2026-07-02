import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCES, isResourceKey } from '../src/resources.ts';

test('every resource has a versioned path and >=1 search field', () => {
  for (const [key, def] of Object.entries(RESOURCES)) {
    assert.match(def.path, /^\d\.\d\//, `${key} path must start with a version segment`);
    assert.ok(def.searchFields.length >= 1, `${key} needs search fields`);
  }
});

test('isResourceKey guards the allow-list', () => {
  assert.equal(isResourceKey('contact'), true);
  assert.equal(isResourceKey('kb_bill'), false);
  assert.equal(isResourceKey(42), false);
});
