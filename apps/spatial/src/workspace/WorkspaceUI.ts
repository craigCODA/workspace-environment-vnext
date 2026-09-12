import * as THREE from 'three';
import type { TransformContract } from '../interaction/InteractionController.ts';
import type { WorldEntity, WorldSnapshot } from './WorldSnapshot.ts';

export type WorkspaceAction = 'objects' | 'add-brick' | 'add-screen' | 'mode' | 'undo' | 'redo' | 'save' | 'transform' | 'appearance' | 'duplicate' | 'remove';
export class WorkspaceUI {
  readonly status = element('span', 'Connecting');
  readonly saveStatus = element('span', 'Loaded world');
  readonly alert = element('div', '');
  readonly #root: HTMLElement;
  readonly #objects = element('aside', '');
  readonly #list = element('div', '');
  readonly #inspector = element('aside', '');
  readonly #name = element('h2', '');
  readonly #fields = new Map<string, HTMLInputElement>();
  readonly #mode: HTMLButtonElement;
  readonly #buttons: HTMLButtonElement[] = [];
  #action: (action: WorkspaceAction) => void = () => {};
  #select: (id: string) => void = () => {};
  #ready = false;
  constructor(root: HTMLElement) {
    this.#root = root;
    const header = element('header', ''); header.className = 'workspace-header';
    const brand = element('div', ''); brand.append(element('strong', 'WORKSPACE'), element('span', 'M2A / Room checkpoint'));
    this.status.dataset.testid = 'connection-status'; header.append(brand, this.status);
    const dock = element('nav', ''); dock.className = 'workspace-dock'; dock.setAttribute('aria-label', 'Workspace controls');
    for (const [name, action] of [['Objects', 'objects'], ['Add brick', 'add-brick'], ['Add screen', 'add-screen'], ['Undo', 'undo'], ['Redo', 'redo'], ['Save', 'save']] as const) dock.append(this.#button(name, action));
    this.#mode = this.#button('Edit mode', 'mode'); this.#mode.dataset.testid = 'mode'; dock.append(this.#mode);
    this.saveStatus.dataset.testid = 'save-status'; dock.append(this.saveStatus);
    this.alert.className = 'workspace-alert'; this.alert.setAttribute('role', 'alert'); this.alert.hidden = true;
    const help = element('p', 'Click empty space to look around · WASD to move · Esc to release · Select an object to edit'); help.className = 'workspace-help';
    this.#objects.className = 'workspace-panel object-panel'; this.#objects.hidden = true;
    this.#objects.append(element('h2', 'Objects'), this.#list);
    this.#inspector.className = 'workspace-panel inspector'; this.#inspector.hidden = true;
    this.#inspector.append(this.#name, element('p', 'Host-owned placement · metres / degrees'));
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
    root.append(header, this.alert, this.#objects, this.#inspector, help, dock);
    this.setReady(false);
  }
  bind(action: (action: WorkspaceAction) => void, select: (id: string) => void): void { this.#action = action; this.#select = select; }
  setReady(ready: boolean): void { this.#ready = ready; for (const button of this.#buttons) button.disabled = !ready; }
  setBusy(busy: boolean): void { for (const button of this.#buttons) button.disabled = busy || !this.#ready; }
  setMode(mode: 'edit' | 'use'): void { this.#mode.textContent = mode === 'edit' ? 'Edit mode' : 'Use mode'; this.#root.dataset.mode = mode; }
  notice(message: string): void { this.alert.textContent = message; this.alert.hidden = !message; }
  toggleObjects(): void { this.#objects.hidden = !this.#objects.hidden; }
  updateWorld(world: WorldSnapshot): void {
    this.#list.replaceChildren();
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind === 'room') continue;
      const button = element('button', entity.name); button.type = 'button'; button.dataset.entityId = entity.id;
      button.addEventListener('click', () => this.#select(entity.id)); this.#list.append(button);
    }
  }
  select(entity?: WorldEntity): void {
    this.#inspector.hidden = !entity; if (!entity) return;
    this.#name.textContent = entity.name;
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
