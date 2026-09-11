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
