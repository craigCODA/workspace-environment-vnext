import * as THREE from 'three';
import type { TransformContract } from '../interaction/InteractionController.ts';
import type { WorldEntity, WorldSnapshot } from './WorldSnapshot.ts';

export type WorkspaceAction = 'objects' | 'applications' | 'add-brick' | 'add-screen' | 'mode' | 'undo' | 'redo' | 'save' | 'transform' | 'appearance' | 'duplicate' | 'remove';
export class WorkspaceUI {
  readonly status = element('span', 'Connecting');
  readonly saveStatus = element('span', 'Loaded world');
  readonly alert = element('div', '');
  readonly #root: HTMLElement;
  readonly #objects = element('aside', '');
  readonly #list = element('div', '');
  readonly #apps = element('aside', '');
  readonly #appList = element('div', '');
  readonly #pickerStatus = element('p', 'Choose a running window to bind to the selected screen.');
  readonly #inspector = element('aside', '');
  readonly #name = element('h2', '');
  readonly #surfaceStatus = element('p', '');
  readonly #fields = new Map<string, HTMLInputElement>();
  readonly #mode: HTMLButtonElement;
  readonly #buttons: HTMLButtonElement[] = [];
  #action: (action: WorkspaceAction) => void = () => {};
  #select: (id: string) => void = () => {};
  #chooseWindow: (windowId: string) => void = () => {};
  #ready = false;
  constructor(root: HTMLElement) {
    this.#root = root;
    const header = element('header', ''); header.className = 'workspace-header';
    const brand = element('div', ''); brand.append(element('strong', 'WORKSPACE'), element('span', 'M2A / Spatial shell'));
    this.status.dataset.testid = 'connection-status'; header.append(brand, this.status);
    const dock = element('nav', ''); dock.className = 'workspace-dock'; dock.setAttribute('aria-label', 'Workspace controls');
    for (const [name, action] of [['Objects', 'objects'], ['Applications', 'applications'], ['Add brick', 'add-brick'], ['Add screen', 'add-screen'], ['Undo', 'undo'], ['Redo', 'redo'], ['Save', 'save']] as const) dock.append(this.#button(name, action));
    this.#mode = this.#button('Edit mode', 'mode'); this.#mode.dataset.testid = 'mode'; dock.append(this.#mode);
    this.saveStatus.dataset.testid = 'save-status'; dock.append(this.saveStatus);
    this.alert.className = 'workspace-alert'; this.alert.setAttribute('role', 'alert'); this.alert.hidden = true;
    const help = element('p', 'Click empty space to look around · WASD to move · Esc to release · Use mode sends input to a live screen'); help.className = 'workspace-help';
    this.#objects.className = 'workspace-panel object-panel'; this.#objects.hidden = true;
    this.#objects.append(element('h2', 'Objects'), this.#list);
    this.#apps.className = 'workspace-panel object-panel'; this.#apps.hidden = true;
    this.#apps.dataset.testid = 'application-picker';
    this.#pickerStatus.dataset.testid = 'picker-status';
    this.#apps.append(element('h2', 'Applications'), this.#pickerStatus, this.#appList);
    this.#surfaceStatus.dataset.testid = 'surface-status';
    this.#inspector.className = 'workspace-panel inspector'; this.#inspector.hidden = true;
    this.#inspector.append(this.#name, this.#surfaceStatus, element('p', 'Host-owned placement · metres / degrees'));
    for (const [group, prefix, initial] of [['Position', 'position', 0], ['Rotation', 'rotation', 0], ['Scale', 'scale', 1]] as const) {
      const row = element('fieldset', ''); row.append(element('legend', group));
      for (const axis of ['X', 'Y', 'Z']) row.append(this.#field(`${prefix}${axis}`, `${group} ${axis}`, 'number', String(initial)));
      this.#inspector.append(row);
    }
    this.#inspector.append(this.#button('Apply transform', 'transform'));
    const dimensions = element('fieldset', ''); dimensions.append(element('legend', 'Dimensions (m)'));
    for (const axis of ['X', 'Y', 'Z']) dimensions.append(this.#field(`dimensions${axis}`, `Dimension ${axis}`, 'number', '1'));
    this.#inspector.append(dimensions, this.#field('color', 'Color', 'color', '#b56845'), this.#button('Apply appearance', 'appearance'));
    const actions = element('div', ''); actions.className = 'object-actions';
    actions.append(this.#button('Duplicate', 'duplicate'), this.#button('Remove', 'remove')); this.#inspector.append(actions);
    root.append(header, this.alert, this.#objects, this.#apps, this.#inspector, help, dock);
    this.setReady(false);
  }
  bind(action: (action: WorkspaceAction) => void, select: (id: string) => void, chooseWindow: (windowId: string) => void = () => {}): void {
    this.#action = action; this.#select = select; this.#chooseWindow = chooseWindow;
  }
  setReady(ready: boolean): void { this.#ready = ready; for (const button of this.#buttons) button.disabled = !ready; }
  setBusy(busy: boolean): void { for (const button of this.#buttons) button.disabled = busy || !this.#ready; }
  setMode(mode: 'edit' | 'use'): void { this.#mode.textContent = mode === 'edit' ? 'Edit mode' : 'Use mode'; this.#root.dataset.mode = mode; }
  notice(message: string): void { this.alert.textContent = message; this.alert.hidden = !message; }
  toggleObjects(): void { this.#objects.hidden = !this.#objects.hidden; if (!this.#objects.hidden) this.#apps.hidden = true; }
  toggleApplications(): boolean { this.#apps.hidden = !this.#apps.hidden; if (!this.#apps.hidden) this.#objects.hidden = true; return !this.#apps.hidden; }
  setPickerStatus(text: string): void { this.#pickerStatus.textContent = text; }
  setSurfaceStatus(text: string): void { this.#surfaceStatus.textContent = text; }
  renderWindows(items: Array<{ windowId: string; label: string }>): void {
    this.#appList.replaceChildren();
    if (items.length === 0) {
      const empty = element('p', 'No running windows discovered.'); this.#appList.append(empty); return;
    }
    for (const item of items) {
      const button = element('button', ''); button.type = 'button';
      button.textContent = item.label; button.dataset.windowId = item.windowId;
      button.addEventListener('click', () => this.#chooseWindow(item.windowId));
      this.#appList.append(button);
    }
  }
  updateWorld(world: WorldSnapshot): void {
    this.#list.replaceChildren();
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind === 'room') continue;
      const button = element('button', entity.name); button.type = 'button'; button.dataset.entityId = entity.id;
      button.addEventListener('click', () => this.#select(entity.id)); this.#list.append(button);
    }
  }
  select(entity?: WorldEntity, surfaceStatus = ''): void {
    this.#inspector.hidden = !entity; if (!entity) return;
    this.#name.textContent = entity.name;
    this.#surfaceStatus.hidden = entity.parameters.kind !== 'surface';
    this.#surfaceStatus.textContent = entity.parameters.kind === 'surface' ? surfaceStatus : '';
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...entity.transform.rotation), 'XYZ');
    const values = { position: entity.transform.position, rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg), scale: entity.transform.scale, dimensions: entity.parameters.dimensions };
    for (const [group, vector] of Object.entries(values)) {
      ['X', 'Y', 'Z'].forEach((axis, i) => { this.#fields.get(`${group}${axis}`)!.value = String(Number(vector[i].toFixed(4))); });
    }
    this.#fields.get('color')!.value = entity.parameters.color ?? '#b56845';
  }
  transform(): TransformContract {
    const rotation = this.#vector('rotation').map(THREE.MathUtils.degToRad);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation as [number, number, number], 'XYZ'));
    const scale = this.#vector('scale');
    if (scale.some(n => n < 0.02 || n > 30)) throw new Error('Scale must be between 0.02 and 30.');
    return { position: this.#vector('position'), rotation: [q.x, q.y, q.z, q.w], scale };
  }
  appearance(): Record<string, unknown> { return { dimensions: this.#vector('dimensions'), color: this.#fields.get('color')!.value }; }
  #vector(prefix: string): [number, number, number] {
    const result = ['X', 'Y', 'Z'].map(axis => this.#fields.get(prefix + axis)!.valueAsNumber);
    if (!result.every(Number.isFinite)) throw new Error('Enter finite numeric values in each field.');
    return result as [number, number, number];
  }
  #button(name: string, action: WorkspaceAction): HTMLButtonElement {
    const button = element('button', name); button.type = 'button';
    button.addEventListener('click', () => this.#action(action)); this.#buttons.push(button); return button;
  }
  #field(key: string, text: string, type: string, value: string): HTMLLabelElement {
    const label = element('label', text); const input = document.createElement('input'); input.type = type;
    input.value = value; input.step = type === 'number' ? '0.05' : ''; input.setAttribute('aria-label', text);
    label.append(input); this.#fields.set(key, input); return label;
  }
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
