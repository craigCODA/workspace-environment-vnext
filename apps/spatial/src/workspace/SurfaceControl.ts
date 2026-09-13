export interface SurfaceInputPayload {
  kind: string;
  phase?: string;
  x?: number;
  y?: number;
  button?: string;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  text?: string;
}

export interface ControlLease {
  leaseId: string;
  mode: string;
}

export interface ControlTransport {
  acquire(entityId: string): Promise<ControlLease>;
  input(entityId: string, leaseId: string, payload: SurfaceInputPayload): Promise<void>;
  release(): Promise<void>;
}

export interface KeyChord {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export class SurfaceControl {
  readonly #transport: ControlTransport;
  #lease: { entityId: string; leaseId: string } | undefined;
  constructor(transport: ControlTransport) {
    this.#transport = transport;
  }
  get entityId(): string | undefined { return this.#lease?.entityId; }
  get leaseId(): string | undefined { return this.#lease?.leaseId; }

  async pointer(entityId: string, phase: 'move' | 'down' | 'up', x: number | null, y: number | null, button?: 'primary' | 'secondary'): Promise<boolean> {
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return false;
    await this.#ensure(entityId);
    const payload: SurfaceInputPayload = { kind: 'pointer', phase, x, y };
    if (phase !== 'move') payload.button = button ?? 'primary';
    await this.#transport.input(this.#lease!.entityId, this.#lease!.leaseId, payload);
    return true;
  }

  async wheel(entityId: string, x: number, y: number, deltaX: number, deltaY: number): Promise<boolean> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    await this.#ensure(entityId);
    await this.#transport.input(this.#lease!.entityId, this.#lease!.leaseId, { kind: 'wheel', x, y, deltaX, deltaY });
    return true;
  }

  async key(phase: 'down' | 'up', event: KeyChord): Promise<boolean> {
    if (!this.#lease || !this.shouldForwardKey(event)) return false;
    await this.#transport.input(this.#lease.entityId, this.#lease.leaseId, { kind: 'key', phase, key: event.key });
    return true;
  }

  async text(value: string): Promise<boolean> {
    if (!this.#lease || !value) return false;
    await this.#transport.input(this.#lease.entityId, this.#lease.leaseId, { kind: 'text', text: value });
    return true;
  }

  shouldForwardKey(event: KeyChord): boolean {
    if (event.metaKey || event.key === 'Meta' || event.key === 'OS') return false;
    if (event.altKey && (event.key === 'Tab' || event.key === 'F4' || event.key === 'Meta')) return false;
    if (event.ctrlKey && event.altKey && event.key === 'Backspace') return false;
    if (event.key === 'Escape') return false;
    return event.key.length > 0 && event.key.length <= 64;
  }

  async release(_reason?: string): Promise<void> {
    if (!this.#lease) return;
    this.#lease = undefined;
    await this.#transport.release();
  }

  async #ensure(entityId: string): Promise<void> {
    if (this.#lease?.entityId === entityId) return;
    if (this.#lease) await this.release('rebind');
    const lease = await this.#transport.acquire(entityId);
    this.#lease = { entityId, leaseId: lease.leaseId };
  }
}

export function createHostControlTransport(httpBase: string, session: string): ControlTransport {
  return {
    async acquire(entityId) {
      const response = await fetch(`${httpBase}/m2a/surfaces/${encodeURIComponent(entityId)}/control`, {
        method: 'POST',
        headers: { 'x-workspace-session': session, 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'messages' }),
      });
      if (!response.ok) throw new Error(await controlError(response));
      const body = await response.json() as { leaseId?: string; mode?: string };
      if (typeof body.leaseId !== 'string') throw new Error('Host did not grant a control lease.');
      return { leaseId: body.leaseId, mode: typeof body.mode === 'string' ? body.mode : 'messages' };
    },
    async input(entityId, leaseId, payload) {
      const response = await fetch(`${httpBase}/m2a/surfaces/${encodeURIComponent(entityId)}/input`, {
        method: 'POST',
        headers: {
          'x-workspace-session': session,
          'x-workspace-control': leaseId,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await controlError(response));
    },
    async release() {
      await fetch(`${httpBase}/m2a/control`, { method: 'DELETE', headers: { 'x-workspace-session': session } }).catch(() => {});
    },
  };
}

async function controlError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    if (typeof body.error === 'string' && body.error) return body.error.replaceAll('_', ' ');
  } catch { /* Use the HTTP status when the host did not return a structured error. */ }
  return `Application control failed (${response.status}).`;
}
