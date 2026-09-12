import type { HostAssetHandle } from '@workspace/creative-sdk';

export interface ResolvedAsset {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface AssetResolver {
  resolve(handle: HostAssetHandle): Promise<ResolvedAsset>;
}

export class MemoryAssetResolver implements AssetResolver {
  readonly #assets = new Map<string, ResolvedAsset>();

  set(handle: HostAssetHandle, asset: ResolvedAsset): void {
    this.#assets.set(handle, asset);
  }

  async resolve(handle: HostAssetHandle): Promise<ResolvedAsset> {
    const asset = this.#assets.get(handle);
    if (!asset) throw new Error('asset_not_authorized');
    return { width: asset.width, height: asset.height, rgba: new Uint8Array(asset.rgba) };
  }
}

const hostAssetPattern = /^asset:sha256:[0-9a-f]{64}$/;

export class HostAssetResolver implements AssetResolver {
  readonly #baseUrl: string;
  readonly #sessionToken: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, sessionToken: string, fetchImpl: typeof fetch = fetch) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#sessionToken = sessionToken;
    this.#fetch = (input, init) => fetchImpl(input, init);
  }

  async resolve(handle: HostAssetHandle): Promise<ResolvedAsset> {
    const rawHandle = String(handle);
    if (!hostAssetPattern.test(rawHandle)) throw new Error('invalid_host_asset_handle');

    const url = new URL(`${this.#baseUrl}/assets/resolve`);
    url.searchParams.set('handle', rawHandle);
    const response = await this.#fetch(url, {
      headers: { 'x-workspace-session': this.#sessionToken },
    });
    if (!response.ok) throw new Error(response.status === 403 ? 'asset_not_authorized' : 'asset_resolve_failed');

    const payload = await response.json() as { width?: unknown; height?: unknown; rgbaBase64?: unknown };
    if (!Number.isInteger(payload.width) || (payload.width as number) <= 0
      || !Number.isInteger(payload.height) || (payload.height as number) <= 0
      || typeof payload.rgbaBase64 !== 'string') {
      throw new Error('asset_payload_invalid');
    }
    const binary = atob(payload.rgbaBase64);
    const rgba = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (rgba.length !== (payload.width as number) * (payload.height as number) * 4) {
      throw new Error('asset_payload_invalid');
    }
    return { width: payload.width as number, height: payload.height as number, rgba };
  }
}
