export type Vec3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];
export type Mat4 = readonly number[];
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export type PackageResourceHandle = string & { readonly __packageResourceHandle: unique symbol };
export type HostAssetHandle = string & { readonly __hostAssetHandle: unique symbol };

export interface LineDescriptor {
  readonly kind: 'line';
  readonly id: string;
  readonly points: readonly Vec3[];
  readonly color: string;
}

export interface IndexedGeometryAttribute {
  readonly itemSize: number;
  readonly values: readonly number[];
}

export interface IndexedGeometryDescriptor {
  readonly kind: 'indexedGeometry';
  readonly id: string;
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly attributes?: Readonly<Record<string, IndexedGeometryAttribute>>;
}

export interface CurveDescriptor {
  readonly kind: 'curve';
  readonly id: string;
  readonly points: readonly Vec3[];
  readonly color: string;
}

export interface ShaderMaterialDescriptor {
  readonly kind: 'shaderMaterial';
  readonly id: string;
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly uniforms?: Readonly<Record<string, JsonValue>>;
}

export interface TextureDescriptor {
  readonly kind: 'texture';
  readonly id: string;
  readonly assetHandle: HostAssetHandle;
}

export interface LightDescriptor {
  readonly kind: 'light';
  readonly id: string;
  readonly lightType: 'ambient' | 'directional' | 'point';
  readonly color: string;
  readonly intensity: number;
  readonly position?: Vec3;
}

export interface PointsDescriptor {
  readonly kind: 'points';
  readonly id: string;
  readonly positions: readonly number[];
  readonly color: string;
  readonly size: number;
}

export interface InstancedDescriptor {
  readonly kind: 'instanced';
  readonly id: string;
  readonly geometryId: string;
  readonly materialId: string;
  readonly transforms: readonly Mat4[];
}

export interface GroupDescriptor {
  readonly kind: 'group';
  readonly id: string;
  readonly children: readonly string[];
  readonly position?: Vec3;
  readonly rotation?: Quaternion;
  readonly scale?: Vec3;
}

export interface CreativeResourceUpdate {
  readonly kind: 'update';
  readonly id: string;
  readonly patch: Readonly<Record<string, JsonValue>>;
}

export type CreativeResourceDescriptor =
  | LineDescriptor
  | IndexedGeometryDescriptor
  | CurveDescriptor
  | ShaderMaterialDescriptor
  | TextureDescriptor
  | LightDescriptor
  | PointsDescriptor
  | InstancedDescriptor
  | GroupDescriptor;

const assetPattern = /^asset:sha256:[0-9a-f]{64}$/;

export function hostAssetHandle(value: string): HostAssetHandle {
  if (!assetPattern.test(value)) throw new Error('invalid_host_asset_handle');
  return value as HostAssetHandle;
}

export function line(id: string, points: readonly Vec3[], color: string): LineDescriptor {
  return Object.freeze({ kind: 'line', id, points: points.map((p) => Object.freeze([...p]) as Vec3), color });
}

export function indexedGeometry(
  id: string,
  positions: readonly number[],
  indices: readonly number[],
  attributes?: Readonly<Record<string, IndexedGeometryAttribute>>,
): IndexedGeometryDescriptor {
  return Object.freeze({ kind: 'indexedGeometry', id, positions: [...positions], indices: [...indices], attributes });
}

export function curve(id: string, points: readonly Vec3[], color: string): CurveDescriptor {
  return Object.freeze({ kind: 'curve', id, points: points.map((p) => Object.freeze([...p]) as Vec3), color });
}

export function shaderMaterial(
  id: string,
  vertexShader: string,
  fragmentShader: string,
  uniforms: Readonly<Record<string, JsonValue>> = {},
): ShaderMaterialDescriptor {
  return Object.freeze({ kind: 'shaderMaterial', id, vertexShader, fragmentShader, uniforms });
}

export function texture(id: string, assetHandle: HostAssetHandle): TextureDescriptor {
  return Object.freeze({ kind: 'texture', id, assetHandle });
}

export function light(
  id: string,
  lightType: LightDescriptor['lightType'],
  color: string,
  intensity: number,
  position?: Vec3,
): LightDescriptor {
  return Object.freeze({ kind: 'light', id, lightType, color, intensity, position });
}

export function points(id: string, positions: readonly number[], color: string, size: number): PointsDescriptor {
  return Object.freeze({ kind: 'points', id, positions: [...positions], color, size });
}

export function instanced(
  id: string,
  geometryId: string,
  materialId: string,
  transforms: readonly Mat4[],
): InstancedDescriptor {
  return Object.freeze({ kind: 'instanced', id, geometryId, materialId, transforms: transforms.map((m) => [...m]) });
}

export function group(
  id: string,
  children: readonly string[],
  transform: { position?: Vec3; rotation?: Quaternion; scale?: Vec3 } = {},
): GroupDescriptor {
  return Object.freeze({ kind: 'group', id, children: [...children], ...transform });
}
