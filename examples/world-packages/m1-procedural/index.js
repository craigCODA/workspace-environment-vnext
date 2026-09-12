import { points, update } from '@workspace/creative-sdk';

points('procedural-points', [-1, 0, 0, 0, 0, 0, 1, 0, 0], '#ffffff', 0.05);

export function onTick(t) {
  const y = Math.sin(t / 250) * 0.25;
  update('procedural-points', { positions: [-1, -y, 0, 0, y, 0, 1, -y, 0] });
}
