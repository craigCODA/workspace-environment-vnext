import * as THREE from 'three';
import type {
  CreativeResourceDescriptor,
  CreativeResourceUpdate,
  HostAssetHandle,
  JsonValue,
} from '@workspace/creative-sdk';
import type { AssetResolver } from '../assets/AssetResolver.ts';
import { validateDescriptor } from '../descriptors/DescriptorValidator.ts';
import { EntityRootRegistry } from './EntityRootRegistry.ts';
import { ResourceRegistry } from './ResourceRegistry.ts';

interface ProjectedResource {
  readonly value: THREE.Object3D | THREE.Material | THREE.Texture | THREE.BufferGeometry;
  readonly object?: THREE.Object3D;
  dispose(): void;
}

export interface ProjectionOwner {
  readonly entityId: string;
  readonly generationToken: string;
  readonly implementationRevision?: number;
}

export class ThreeResourceProjector {
  readonly #registry = new ResourceRegistry<ProjectedResource>((resource) => resource.dispose());

  constructor(
    readonly scene: THREE.Group,
    readonly assets: AssetResolver,
    readonly roots: EntityRootRegistry = new EntityRootRegistry(),
  ) {}

  async applyBatch(owner: ProjectionOwner, batch: readonly CreativeResourceDescriptor[]): Promise<void> {
    const root = this.roots.createRoot({
      entityId: owner.entityId,
      generationToken: owner.generationToken,
      implementationRevision: owner.implementationRevision ?? 0,
    });
    if (!root.parent) this.scene.add(root);

    for (const descriptor of batch) {
      const validation = validateDescriptor(descriptor);
      if (!validation.ok) throw new Error(`invalid_descriptor:${validation.errors?.join(';') ?? 'unknown'}`);
      const projected = await this.#project(owner.generationToken, descriptor);
      this.#registry.set(owner.generationToken, descriptor.id, projected);
      if (projected.object && !projected.object.parent) root.add(projected.object);
    }

    for (const descriptor of batch) {
      if (descriptor.kind !== 'group') continue;
      const group = this.#registry.get(owner.generationToken, descriptor.id)?.object;
      if (!(group instanceof THREE.Group)) continue;
      for (const childId of descriptor.children) {
        const child = this.#registry.get(owner.generationToken, childId)?.object;
        if (child && child !== group) group.add(child);
      }
    }
  }

  applyUpdate(owner: ProjectionOwner, update: CreativeResourceUpdate): void {
    const validation = validateDescriptor(update);
    if (!validation.ok) throw new Error(`invalid_update:${validation.errors?.join(';') ?? 'unknown'}`);
    const resource = this.#registry.get(owner.generationToken, update.id);
    if (!resource) throw new Error('resource_not_owned');
    const patch = update.patch;
    if (resource.object) {
      const position = patch.position;
      if (Array.isArray(position) && position.length === 3 && position.every((x) => typeof x === 'number')) {
        resource.object.position.set(position[0] as number, position[1] as number, position[2] as number);
      }
      if (typeof patch.visible === 'boolean') resource.object.visible = patch.visible;
    }
    if (resource.value instanceof THREE.ShaderMaterial && typeof patch.uniforms === 'object' && patch.uniforms !== null && !Array.isArray(patch.uniforms)) {
      for (const [key, value] of Object.entries(patch.uniforms as Record<string, JsonValue>)) {
        resource.value.uniforms[key] = { value: cloneUniform(value) };
      }
    }
  }

  retireGeneration(generationToken: string): void {
    this.#registry.retireGeneration(generationToken);
    this.roots.retireGeneration(generationToken);
  }

  getResource(generationToken: string, id: string): unknown {
    return this.#registry.get(generationToken, id)?.value;
  }

  async #project(generationToken: string, descriptor: CreativeResourceDescriptor): Promise<ProjectedResource> {
    switch (descriptor.kind) {
      case 'line': {
        const geometry = new THREE.BufferGeometry().setFromPoints(descriptor.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
        const material = new THREE.LineBasicMaterial({ color: descriptor.color });
        const object = new THREE.Line(geometry, material);
        return disposableObject(object, [geometry, material]);
      }
      case 'indexedGeometry': {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(descriptor.positions, 3));
        geometry.setIndex([...descriptor.indices]);
        for (const [name, attribute] of Object.entries(descriptor.attributes ?? {})) {
          geometry.setAttribute(name, new THREE.Float32BufferAttribute(attribute.values, attribute.itemSize));
        }
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: false });
        const object = new THREE.Mesh(geometry, material);
        return disposableObject(object, [geometry, material]);
      }
      case 'curve': {
        const points = descriptor.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
        const sampled = points.length > 2 ? new THREE.CatmullRomCurve3(points).getPoints(32) : points;
        const geometry = new THREE.BufferGeometry().setFromPoints(sampled);
        const material = new THREE.LineBasicMaterial({ color: descriptor.color });
        const object = new THREE.Line(geometry, material);
        return disposableObject(object, [geometry, material]);
      }
      case 'shaderMaterial': {
        const material = new THREE.ShaderMaterial({
          vertexShader: descriptor.vertexShader,
          fragmentShader: descriptor.fragmentShader,
          uniforms: Object.fromEntries(Object.entries(descriptor.uniforms ?? {}).map(([key, value]) => [key, { value: cloneUniform(value) }])),
        });
        return disposableValue(material, () => material.dispose());
      }
      case 'texture': {
        const asset = await this.assets.resolve(descriptor.assetHandle as HostAssetHandle);
        const texture = new THREE.DataTexture(new Uint8Array(asset.rgba), asset.width, asset.height, THREE.RGBAFormat);
        texture.needsUpdate = true;
        return disposableValue(texture, () => texture.dispose());
      }
      case 'light': {
        const object = descriptor.lightType === 'ambient'
          ? new THREE.AmbientLight(descriptor.color, descriptor.intensity)
          : descriptor.lightType === 'directional'
            ? new THREE.DirectionalLight(descriptor.color, descriptor.intensity)
            : new THREE.PointLight(descriptor.color, descriptor.intensity);
        if (descriptor.position) object.position.set(...descriptor.position);
        return disposableObject(object, []);
      }
      case 'points': {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(descriptor.positions, 3));
        const material = new THREE.PointsMaterial({ color: descriptor.color, size: descriptor.size });
        const object = new THREE.Points(geometry, material);
        return disposableObject(object, [geometry, material]);
      }
      case 'instanced': {
        const geometryResource = this.#registry.get(generationToken, descriptor.geometryId)?.value;
        const materialResource = this.#registry.get(generationToken, descriptor.materialId)?.value;
        const geometry = geometryResource instanceof THREE.BufferGeometry ? geometryResource : undefined;
        const material = materialResource instanceof THREE.Material ? materialResource : undefined;
        if (!geometry || !material) throw new Error('instanced_dependency_missing');
        const object = new THREE.InstancedMesh(geometry, material, descriptor.transforms.length);
        descriptor.transforms.forEach((values, index) => {
          if (values.length !== 16) throw new Error('invalid_instance_transform');
          object.setMatrixAt(index, new THREE.Matrix4().fromArray([...values]));
        });
        object.instanceMatrix.needsUpdate = true;
        return disposableObject(object, []);
      }
      case 'group': {
        const object = new THREE.Group();
        if (descriptor.position) object.position.set(...descriptor.position);
        if (descriptor.rotation) object.quaternion.set(...descriptor.rotation);
        if (descriptor.scale) object.scale.set(...descriptor.scale);
        return disposableObject(object, []);
      }
    }
  }
}

function disposableObject(object: THREE.Object3D, resources: readonly { dispose(): void }[]): ProjectedResource {
  return {
    value: object,
    object,
    dispose() {
      object.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}

function disposableValue(value: THREE.Material | THREE.Texture | THREE.BufferGeometry, dispose: () => void): ProjectedResource {
  return { value, dispose };
}

function cloneUniform(value: JsonValue): unknown {
  return value === undefined ? undefined : structuredClone(value);
}
