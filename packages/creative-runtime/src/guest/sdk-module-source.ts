export const CREATIVE_SDK_MODULE_SOURCE = String.raw`
const freeze = (value) => Object.freeze(value);
const emit = (value) => { globalThis.__workspace_emitDescriptor(value); return value; };
const emitUpdate = (value) => { globalThis.__workspace_emitUpdate(value); return value; };

export function line(id, points, color) {
  return emit(freeze({ kind: 'line', id, points, color }));
}

export function indexedGeometry(id, positions, indices, attributes = undefined) {
  return emit(freeze({ kind: 'indexedGeometry', id, positions, indices, ...(attributes === undefined ? {} : { attributes }) }));
}

export function curve(id, points, color) {
  return emit(freeze({ kind: 'curve', id, points, color }));
}

export function shaderMaterial(id, vertexShader, fragmentShader, uniforms = {}) {
  return emit(freeze({ kind: 'shaderMaterial', id, vertexShader, fragmentShader, uniforms }));
}

export function texture(id, assetHandle) {
  return emit(freeze({ kind: 'texture', id, assetHandle }));
}

export function light(id, lightType, color, intensity, position = undefined) {
  return emit(freeze({ kind: 'light', id, lightType, color, intensity, ...(position === undefined ? {} : { position }) }));
}

export function points(id, positions, color, size) {
  return emit(freeze({ kind: 'points', id, positions, color, size }));
}

export function instanced(id, geometryId, materialId, transforms) {
  return emit(freeze({ kind: 'instanced', id, geometryId, materialId, transforms }));
}

export function group(id, children, transform = {}) {
  return emit(freeze({ kind: 'group', id, children, ...transform }));
}

export function update(id, patch) {
  return emitUpdate(freeze({ kind: 'update', id, patch }));
}

export function checkpoint(state) {
  globalThis.__workspace_checkpointState(state);
  return state;
}
`;
