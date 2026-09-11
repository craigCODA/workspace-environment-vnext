import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDescriptor } from './DescriptorValidator.ts';

for (const locator of [
  'file:///C:/Users/test/secret.png',
  'https://example.com/a.png',
  '..\\..\\secret.png',
  '\\\\server\\share\\image.png',
]) {
  test(`rejects locator ${locator}`, () => {
    const result = validateDescriptor({ kind: 'texture', id: 't', assetHandle: locator });
    assert.equal(result.ok, false);
  });
}

test('accepts host asset handle syntax', () => {
  const result = validateDescriptor({ kind: 'texture', id: 't', assetHandle: `asset:sha256:${'a'.repeat(64)}` });
  assert.equal(result.ok, true);
});
