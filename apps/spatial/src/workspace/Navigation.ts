import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/** Camera input belongs to the world only while the world owns pointer lock. */
export class Navigation {
  readonly controls: PointerLockControls;
  readonly #camera: THREE.PerspectiveCamera;
  readonly #keys = new Set<string>();
  readonly #events = new AbortController();
  bounds: [number, number] = [8, 6];
  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, onCapture: (locked: boolean) => void) {
    this.#camera = camera;
    this.controls = new PointerLockControls(camera, canvas);
    this.controls.minPolarAngle = 0.08; this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.addEventListener('lock', () => onCapture(true));
    this.controls.addEventListener('unlock', () => { this.#keys.clear(); onCapture(false); });
    const options = { signal: this.#events.signal };
    window.addEventListener('keydown', e => {
      if (!this.controls.isLocked || e.ctrlKey || e.altKey || e.metaKey) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(e.code)) { this.#keys.add(e.code); e.preventDefault(); }
    }, options);
    window.addEventListener('keyup', e => this.#keys.delete(e.code), options);
    window.addEventListener('blur', () => this.release(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.release(); }, options);
  }
  capture(): void { this.controls.lock(); }
  release(): void { this.#keys.clear(); this.controls.unlock(); }
  tick(delta: number): void {
    if (!this.controls.isLocked) return;
    const x = Number(this.#keys.has('KeyD')) - Number(this.#keys.has('KeyA'));
    const z = Number(this.#keys.has('KeyW')) - Number(this.#keys.has('KeyS'));
    const length = Math.hypot(x, z) || 1;
    const speed = this.#keys.has('ShiftLeft') || this.#keys.has('ShiftRight') ? 4.5 : 2.4;
    const distance = speed * Math.min(delta, 0.05);
    this.controls.moveRight(x / length * distance); this.controls.moveForward(z / length * distance);
    this.#camera.position.x = THREE.MathUtils.clamp(this.#camera.position.x, -this.bounds[0] + 0.3, this.bounds[0] - 0.3);
    this.#camera.position.z = THREE.MathUtils.clamp(this.#camera.position.z, -this.bounds[1] + 0.3, this.bounds[1] - 0.3);
  }
  dispose(): void { this.release(); this.#events.abort(); this.controls.dispose(); }
}
