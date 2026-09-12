import assert from 'node:assert/strict';
import test from 'node:test';
import { hostAssetHandle } from '@workspace/creative-sdk';
import * as assetModule from './AssetResolver.ts';

test('A50 descriptor locator cannot induce trusted renderer fetch', async () => {
  assert.equal(typeof assetModule.HostAssetResolver, 'function', 'HostAssetResolver must exist');
  let fetchCalls = 0;
  const resolver = new assetModule.HostAssetResolver!('http://127.0.0.1:43123', 'session-token', async () => {
    fetchCalls += 1;
    throw new Error('fetch_should_not_run');
  });

  for (const locator of ['https://example.com/a.png', 'file:///C:/secret.png', '../secret.png', '\\\\server\\share\\image.png']) {
    await assert.rejects(() => resolver.resolve(locator as never), /invalid_host_asset_handle/);
  }
  assert.equal(fetchCalls, 0);
});

test('host asset resolver fetches trusted RGBA bytes only for an opaque handle', async () => {
  assert.equal(typeof assetModule.HostAssetResolver, 'function', 'HostAssetResolver must exist');
  const handle = hostAssetHandle(`asset:sha256:${'a'.repeat(64)}`);
  const requests: Array<{ url: string; session: string | null }> = [];
  const resolver = new assetModule.HostAssetResolver!('http://127.0.0.1:43123', 'session-token', async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), session: headers.get('x-workspace-session') });
    return new Response(JSON.stringify({ width: 1, height: 1, rgbaBase64: '/wAA/w==' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const asset = await resolver.resolve(handle);
  assert.deepEqual([...asset.rgba], [255, 0, 0, 255]);
  assert.equal(asset.width, 1);
  assert.equal(asset.height, 1);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.session, 'session-token');
  assert.match(requests[0]?.url ?? '', /\/assets\/resolve\?handle=asset%3Asha256%3A/);
});

test('host asset resolver invokes browser fetch without rebinding its receiver', async () => {
  const handle = hostAssetHandle(`asset:sha256:${'b'.repeat(64)}`);
  let observedThis: unknown = Symbol('unset');
  const browserLikeFetch = function (this: unknown, _input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
    observedThis = this;
    if (this !== undefined) throw new TypeError('Illegal invocation');
    return Promise.resolve(new Response(JSON.stringify({ width: 1, height: 1, rgbaBase64: 'AAAA/w==' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
  } as typeof fetch;
  const resolver = new assetModule.HostAssetResolver!('http://127.0.0.1:43123', 'session-token', browserLikeFetch);

  await resolver.resolve(handle);
  assert.equal(observedThis, undefined);
});
