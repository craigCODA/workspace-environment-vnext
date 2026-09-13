import * as THREE from 'three';
import type { ThreeResourceProjector } from '@workspace/spatial-runtime';
import { containFit } from './contentMapping.ts';
import type { SurfacePresentation } from './frameStream.ts';
import type { WorldEntity, WorldSnapshot } from './WorldSnapshot.ts';

export class WorkspaceScene {
  readonly scene = new THREE.Scene();
  readonly projection = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 150);
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas = document.createElement('canvas');
  readonly screens = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  readonly live = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  readonly #room = new THREE.Group();
  readonly #owned = new Map<string, THREE.Group>();
  readonly #resize: ResizeObserver;
  readonly #selection = new THREE.BoxHelper(new THREE.Group(), 0x66d8c1);
  #selected: THREE.Object3D | undefined;
  #roomKey = '';
  rendererStatus = 'ready';

  constructor(root: HTMLElement, onRecovery: (message: string) => void) {
    this.canvas.dataset.m2aWorld = 'true';
    this.canvas.setAttribute('aria-label', 'Workspace world');
    root.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x151e29);
    this.scene.fog = new THREE.Fog(0x151e29, 12, 48);
    this.camera.position.set(0, 1.65, 3.6);
    this.scene.add(this.projection, this.#room, this.#selection);
    this.#selection.visible = false;
    this.scene.add(new THREE.HemisphereLight(0xf2f7ff, 0x5b646e, 2.2));
    const light = new THREE.DirectionalLight(0xfff4de, 2.5); light.position.set(2, 6, 3); this.scene.add(light);
    const size = () => {
      const { width, height } = root.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    };
    this.#resize = new ResizeObserver(size); this.#resize.observe(root); size();
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.rendererStatus = 'context-lost'; onRecovery('Renderer interrupted. Your saved world is intact.'); });
    this.canvas.addEventListener('webglcontextrestored', () => { this.rendererStatus = 'ready'; onRecovery('Renderer restored.'); });
  }

  synchronize(world: WorldSnapshot, projector: ThreeResourceProjector): void {
    const room = Object.values(world.entities).find(e => e.parameters.kind === 'room');
    if (room) this.#makeRoom(room);
    for (const [id, object] of this.#owned) {
      if (!world.entities[id]) { object.removeFromParent(); disposeTree(object); this.#owned.delete(id); this.screens.delete(id); this.live.delete(id); }
    }
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind === 'room') continue;
      const binding = entity.packageBinding;
      const root = projector.roots.createRoot({ entityId: entity.id, generationToken: binding?.generationToken ?? `world:${entity.id}`, implementationRevision: entity.revisions.implementation });
      if (!root.parent) this.projection.add(root);
      root.position.set(...entity.transform.position); root.quaternion.set(...entity.transform.rotation); root.scale.set(...entity.transform.scale);
      if (entity.parameters.kind === 'surface' && !this.#owned.has(entity.id)) {
        const screen = this.#makeScreen(entity);
        root.add(screen); this.#owned.set(entity.id, screen);
      }
      for (const child of root.children) {
        if (child.name.startsWith('workspace-implementation:') || child.name === 'm2a-screen') child.scale.set(...entity.parameters.dimensions);
      }
      if (entity.parameters.kind === 'brick') {
        root.traverse(object => {
          if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) object.material.color.set(entity.parameters.color ?? '#b56845');
        });
      }
    }
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind !== 'room') projector.roots.setParent(entity.id, entity.parentId, this.projection);
    }
  }
  select(object?: THREE.Object3D): void {
    this.#selected = object; this.#selection.visible = !!object;
    if (object) this.#selection.setFromObject(object);
  }
  ray(x: number, y: number): THREE.Raycaster {
    const rect = this.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), this.camera);
    return ray;
  }
  render(): void {
    if (this.rendererStatus !== 'ready') return;
    if (this.#selected) this.#selection.setFromObject(this.#selected);
    this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.#resize.disconnect(); this.renderer.setAnimationLoop(null);
    disposeTree(this.#room); for (const object of this.#owned.values()) disposeTree(object);
    this.#selection.geometry.dispose(); (this.#selection.material as THREE.Material).dispose();
    this.renderer.dispose(); this.canvas.remove();
  }
  applySurfaceFrame(entityId: string, image: unknown, width: number, height: number): void {
    const face = this.screens.get(entityId); const live = this.live.get(entityId);
    if (!face || !live || width < 1 || height < 1) return;
    const material = live.material;
    if (material.map) material.map.dispose();
    const texture = new THREE.Texture();
    texture.image = image as TexImageSource;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;
    material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
    const fit = containFit(face.scale.x / face.scale.y, width / height);
    live.scale.set(Math.max(fit.u1 - fit.u0, 0.01), Math.max(fit.v1 - fit.v0, 0.01), 1);
    live.position.set((fit.u0 + fit.u1) / 2 - 0.5, (fit.v0 + fit.v1) / 2 - 0.5, 0.002);
    live.visible = true; live.userData.surfaceStatus = 'live';
    if (face.material.map) { face.material.map.dispose(); face.material.map = null; }
    face.material.color.set(0x111111); face.material.needsUpdate = true; face.userData.surfaceStatus = 'live';
  }
  showSurfaceStatus(entityId: string, status: SurfacePresentation): void {
    const face = this.screens.get(entityId); const live = this.live.get(entityId);
    if (!face || face.userData.surfaceStatus === status) return;
    face.userData.surfaceStatus = status;
    if (status === 'live') {
      if (face.material.map) { face.material.map.dispose(); face.material.map = null; }
      face.material.color.set(0x111111); face.material.needsUpdate = true; return;
    }
    if (live) {
      live.visible = false;
      if (live.material.map) { live.material.map.dispose(); live.material.map = null; live.material.needsUpdate = true; }
    }
    if (face.material.map) face.material.map.dispose();
    face.material.map = statusTexture(status); face.material.color.set(0xffffff); face.material.needsUpdate = true;
  }
  disposeSurfaceMedia(entityId: string): void {
    const live = this.live.get(entityId);
    if (live) {
      live.visible = false;
      if (live.material.map) { live.material.map.dispose(); live.material.map = null; live.material.needsUpdate = true; }
    }
    const face = this.screens.get(entityId);
    if (face) {
      if (face.material.map) face.material.map.dispose();
      face.material.map = statusTexture('unbound'); face.material.color.set(0xffffff); face.material.needsUpdate = true;
      face.userData.surfaceStatus = 'unbound';
    }
  }
  liveHit(hit: THREE.Intersection): { entityId: string; x: number; y: number } | null {
    if (!hit.object.visible || hit.object.name !== 'm2a-screen-live' || !hit.uv) return null;
    const entityId = hit.object.userData.entityId;
    if (typeof entityId !== 'string') return null;
    return { entityId, x: hit.uv.x, y: 1 - hit.uv.y };
  }
  #makeScreen(entity: WorldEntity): THREE.Group {
    const group = new THREE.Group(); group.name = 'm2a-screen';
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1d2936, roughness: 0.55 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: screenPlaceholder(entity.name) }));
    face.name = 'm2a-screen-content'; face.position.z = 0.515; face.scale.set(0.94, 0.9, 1); face.userData.entityId = entity.id;
    const live = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    live.name = 'm2a-screen-live'; live.position.z = 0.002; live.visible = false; live.userData.entityId = entity.id;
    face.add(live); this.screens.set(entity.id, face); this.live.set(entity.id, live); group.add(body, face); return group;
  }
  #makeRoom(entity: WorldEntity): void {
    const key = JSON.stringify([entity.transform, entity.parameters.dimensions]);
    if (key === this.#roomKey) return;
    this.#roomKey = key; disposeTree(this.#room); this.#room.clear();
    const [width, height, depth] = entity.parameters.dimensions;
    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
      mesh.position.set(x, y, z); this.#room.add(mesh); return mesh;
    };
    addBox(width, 0.15, depth, 0, -0.075, 0, 0x78838a);
    addBox(width, height, 0.15, 0, height / 2, -depth / 2, 0xc5cdd0);
    addBox(width, height, 0.15, 0, height / 2, depth / 2, 0xc5cdd0);
    addBox(0.15, height, depth, -width / 2, height / 2, 0, 0xb4c1c9);
    addBox(0.15, height, depth, width / 2, height / 2, 0, 0xc3c9c8);
    addBox(width, 0.1, depth, 0, height, 0, 0xdde0df);
    for (const z of [-depth / 2 + 0.1, depth / 2 - 0.1]) addBox(width, 0.12, 0.05, 0, 0.12, z, 0x35454d);
    // A simple plinth is room presentation, not a second copy of the authored brick.
    addBox(1.6, 0.08, 0.8, 0, 0.74, -1.2, 0x414f56);
    addBox(0.18, 0.7, 0.5, -0.6, 0.35, -1.2, 0x414f56);
    addBox(0.18, 0.7, 0.5, 0.6, 0.35, -1.2, 0x414f56);
    const grid = new THREE.GridHelper(Math.max(width, depth), Math.max(width, depth), 0x61717b, 0x697881);
    grid.position.y = 0.003; this.#room.add(grid);
    this.#room.position.set(...entity.transform.position); this.#room.quaternion.set(...entity.transform.rotation); this.#room.scale.set(...entity.transform.scale);
  }
}
export function screenPlaceholder(title: string): THREE.CanvasTexture {
  return statusTexture('unbound', title);
}
export function statusTexture(status: SurfacePresentation, title = 'Application screen'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 576;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Screen labels require a canvas context.');
  ctx.fillStyle = '#17232d'; ctx.fillRect(0, 0, 1024, 576);
  ctx.fillStyle = '#6dd8c3'; ctx.font = '24px sans-serif'; ctx.fillText('WORKSPACE / APPLICATION SURFACE', 58, 78);
  ctx.fillStyle = '#f2f6f7'; ctx.font = '40px sans-serif'; ctx.fillText(title.slice(0, 38), 58, 238);
  ctx.fillStyle = '#aebfc8'; ctx.font = '26px sans-serif'; ctx.fillText(statusMessage(status), 58, 300);
  ctx.font = '20px sans-serif'; ctx.fillText('Saved placement. Live applications. Your computer.', 58, 494);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
export function statusMessage(status: SurfacePresentation): string {
  switch (status) {
    case 'unbound': return 'Choose a running Windows window to connect.';
    case 'connecting': return 'Connecting to the selected window.';
    case 'waiting': return 'Waiting for a captured frame.';
    case 'live': return 'Live Windows capture.';
    case 'minimized': return 'The window is minimized, so capture is paused.';
    case 'missing': return 'The saved window is missing or ambiguous.';
    case 'protected': return 'This window blocks capture.';
    default: return 'Capture is unavailable on this host.';
  }
}
function disposeTree(root: THREE.Object3D): void {
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose();
      }
    }
  });
}
