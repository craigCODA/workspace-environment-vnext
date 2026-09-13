import { acceptFrameSequence, presentCaptureStatus, type SurfacePresentation } from './frameStream.ts';
import type { WorldEntity, WorldSnapshot } from './WorldSnapshot.ts';

export interface FrameRead {
  status: string;
  sequence?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  body?: ArrayBuffer;
}

export interface SurfaceTransport {
  readFrame(entityId: string, after: number, signal?: AbortSignal): Promise<FrameRead>;
}

export interface DecodedFrame {
  image: unknown;
  width: number;
  height: number;
}

export interface SurfacePresenter {
  showFrame(entityId: string, image: unknown, width: number, height: number): void;
  showStatus(entityId: string, status: SurfacePresentation, detail?: string): void;
  dispose(entityId: string): void;
}

export interface SurfaceSnapshot {
  status: SurfacePresentation;
  sequence: number;
  width: number;
  height: number;
}

interface TrackedSurface {
  selector: string;
  sequence: number;
  hasFrame: boolean;
  status: SurfacePresentation;
  width: number;
  height: number;
  image?: unknown;
}

export class ApplicationSurfaces {
  readonly #transport: SurfaceTransport;
  readonly #decode: (body: ArrayBuffer, mimeType: string) => Promise<DecodedFrame>;
  readonly #presenter: SurfacePresenter;
  readonly #closeImage?: (image: unknown) => void;
  readonly #tracked = new Map<string, TrackedSurface>();

  constructor(options: {
    transport: SurfaceTransport;
    decode: (body: ArrayBuffer, mimeType: string) => Promise<DecodedFrame>;
    presenter: SurfacePresenter;
    closeImage?: (image: unknown) => void;
  }) {
    this.#transport = options.transport;
    this.#decode = options.decode;
    this.#presenter = options.presenter;
    this.#closeImage = options.closeImage;
  }

  sync(world: WorldSnapshot): void {
    const next = new Map<string, WorldEntity>();
    for (const entity of Object.values(world.entities)) {
      if (entity.parameters.kind === 'surface') next.set(entity.id, entity);
    }
    for (const id of [...this.#tracked.keys()]) {
      const entity = next.get(id);
      if (!entity) { this.#drop(id); continue; }
      const selector = selectorKey(entity);
      const tracked = this.#tracked.get(id)!;
      if (tracked.selector !== selector) this.#reset(id, selector);
    }
    for (const [id, entity] of next) {
      if (!this.#tracked.has(id)) {
        this.#tracked.set(id, {
          selector: selectorKey(entity),
          sequence: 0,
          hasFrame: false,
          status: entity.parameters.application ? 'connecting' : 'unbound',
          width: 0,
          height: 0,
        });
      }
    }
  }

  async poll(): Promise<void> {
    for (const [entityId, tracked] of this.#tracked) {
      const read = await this.#transport.readFrame(entityId, tracked.sequence);
      if (read.status === 'waiting_for_frame' && tracked.sequence > 0) this.#reset(entityId, tracked.selector, false);
      const current = this.#tracked.get(entityId);
      if (!current) continue;
      const accepted = read.body && read.sequence != null
        ? acceptFrameSequence(current.sequence, read.sequence, { reset: current.sequence === 0 })
        : null;
      if (accepted != null && read.body && read.mimeType) {
        const decoded = await this.#decode(read.body, read.mimeType);
        const previous = current.image;
        current.image = decoded.image;
        current.sequence = accepted;
        current.hasFrame = true;
        current.width = decoded.width;
        current.height = decoded.height;
        this.#presenter.showFrame(entityId, decoded.image, decoded.width, decoded.height);
        if (previous) this.#closeImage?.(previous);
      }
      current.status = presentCaptureStatus(read.status, current.hasFrame);
      this.#presenter.showStatus(entityId, current.status);
      if (current.status !== 'live' && current.status !== 'waiting' && current.status !== 'connecting' && current.image) {
        this.#closeImage?.(current.image);
        current.image = undefined;
        current.hasFrame = false;
      }
    }
  }

  restart(): void {
    for (const id of this.#tracked.keys()) this.#reset(id, this.#tracked.get(id)!.selector);
  }

  dispose(): void {
    for (const id of [...this.#tracked.keys()]) this.#drop(id);
  }

  snapshot(): Record<string, SurfaceSnapshot> {
    return Object.fromEntries([...this.#tracked].map(([id, tracked]) => [id, {
      status: tracked.status,
      sequence: tracked.sequence,
      width: tracked.width,
      height: tracked.height,
    }]));
  }

  #reset(entityId: string, selector: string, notify = true): void {
    const tracked = this.#tracked.get(entityId);
    const image = tracked?.image;
    if (notify) this.#presenter.dispose(entityId);
    if (image) this.#closeImage?.(image);
    this.#tracked.set(entityId, {
      selector,
      sequence: 0,
      hasFrame: false,
      status: selector ? 'connecting' : 'unbound',
      width: 0,
      height: 0,
    });
  }

  #drop(entityId: string): void {
    const tracked = this.#tracked.get(entityId);
    this.#presenter.dispose(entityId);
    if (tracked?.image) this.#closeImage?.(tracked.image);
    this.#tracked.delete(entityId);
  }
}

export function selectorKey(entity: WorldEntity): string {
  const application = entity.parameters.application;
  return application
    ? [application.applicationId, application.executablePath, application.windowClass, application.titleHint].join('\0')
    : '';
}

export function createHostFrameTransport(httpBase: string, session: string): SurfaceTransport {
  return {
    async readFrame(entityId, after, signal) {
      const response = await fetch(`${httpBase}/m2a/surfaces/${encodeURIComponent(entityId)}/frame?after=${after}`, {
        headers: { 'x-workspace-session': session },
        signal,
      });
      const capture = response.headers.get('X-Workspace-Capture') ?? 'unavailable';
      if (response.status === 404) return { status: 'unbound' };
      if (response.status === 204 || !response.ok) return { status: capture };
      const body = await response.arrayBuffer();
      return {
        status: capture,
        sequence: Number(response.headers.get('X-Frame-Sequence')),
        width: Number(response.headers.get('X-Frame-Width')),
        height: Number(response.headers.get('X-Frame-Height')),
        mimeType: response.headers.get('content-type')?.split(';')[0] ?? undefined,
        body,
      };
    },
  };
}

export async function decodeBitmap(body: ArrayBuffer, mimeType: string): Promise<DecodedFrame> {
  const bitmap = await createImageBitmap(new Blob([body], { type: mimeType }), { imageOrientation: 'flipY' });
  return { image: bitmap, width: bitmap.width, height: bitmap.height };
}

export function closeBitmap(image: unknown): void {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}
