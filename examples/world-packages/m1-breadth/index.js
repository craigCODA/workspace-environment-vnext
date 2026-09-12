import {
  curve,
  indexedGeometry,
  instanced,
  light,
  points,
  shaderMaterial,
  texture,
  update,
} from '@workspace/creative-sdk';

const assetHandle = 'asset:sha256:c21b35e3f28e676cedf24c13575a7346682e101a2d26aad9598d0cdbcee9ee3b';

indexedGeometry(
  'breadth-geometry',
  [-0.45, -0.35, 0, 0.45, -0.35, 0, 0, 0.45, 0],
  [0, 1, 2],
  { heat: { itemSize: 1, values: [0, 0.5, 1] } },
);
curve('breadth-curve', [[-1.4, -0.7, 0], [-0.8, 0.8, 0], [0, 0.9, 0], [0.8, 0.8, 0], [1.4, -0.7, 0]], '#48d1cc');
shaderMaterial(
  'breadth-material',
  'void main(){ gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
  'uniform float uTime; void main(){ gl_FragColor = vec4(0.35 + 0.35 * sin(uTime), 0.55, 1.0, 1.0); }',
  { uTime: 0 },
);
texture('breadth-texture', assetHandle);
light('breadth-light', 'point', '#ffffff', 2, [0, 1.5, 2]);
points('breadth-points', [-0.75, 0, 0.15, 0, 0.65, 0.15, 0.75, 0, 0.15], '#ffffff', 0.08);
instanced('breadth-instances', 'breadth-geometry', 'breadth-material', [
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.8, -0.2, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.8, -0.2, 0, 1],
]);
indexedGeometry(
  'guest-approve',
  [-0.18, -0.12, 0.25, 0.18, -0.12, 0.25, 0, 0.16, 0.25],
  [0, 1, 2],
  { heat: { itemSize: 1, values: [1, 1, 1] } },
);

export function onTick(t) {
  const phase = t / 1000;
  update('breadth-points', {
    positions: [-0.75, Math.sin(phase) * 0.15, 0.15, 0, 0.65, 0.15, 0.75, Math.cos(phase) * 0.15, 0.15],
  });
  update('breadth-material', { uniforms: { uTime: phase } });
}
