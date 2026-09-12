import { indexedGeometry } from '@workspace/creative-sdk';
// A unit box in package-local coordinates. Durable dimensions, tint and placement
// are authored instance parameters projected by the trusted M2A renderer.
indexedGeometry('brick-body', [
  -0.5,-0.5, 0.5, 0.5,-0.5, 0.5, 0.5, 0.5, 0.5,-0.5, 0.5, 0.5,
  -0.5,-0.5,-0.5,-0.5, 0.5,-0.5, 0.5, 0.5,-0.5, 0.5,-0.5,-0.5,
], [0,1,2,0,2,3, 4,5,6,4,6,7, 3,2,6,3,6,5, 4,7,1,4,1,0, 1,7,6,1,6,2, 4,0,3,4,3,5]);
