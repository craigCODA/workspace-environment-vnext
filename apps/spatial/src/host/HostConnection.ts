import type { CommandName, VNextEnvelope } from '@workspace/vnext-contracts';
import type { RuntimeCoordinator } from '../runtime/RuntimeCoordinator.ts';

export interface HostCommandResponse {
  readonly accepted: boolean;
  readonly errorCode?: string | null;
  readonly payload?: Record<string, unknown> | null;
}

interface PendingCommand {
  resolve(response: HostCommandResponse): void;
  reject(error: Error): void;
}

export class HostConnection {
  readonly #socket: WebSocket;
  readonly #runtime: RuntimeCoordinator;
  readonly #pending = new Map<string, PendingCommand>();

  private constructor(socket: WebSocket, runtime: RuntimeCoordinator) {
    this.#socket = socket;
    this.#runtime = runtime;
    socket.addEventListener('message', (event) => void this.#onMessage(String(event.data)));
    socket.addEventListener('close', () => this.#rejectPending(new Error('host_connection_closed')));
  }

  static connect(url: string, token: string, runtime: RuntimeCoordinator): Promise<HostConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const onError = () => reject(new Error('host_connection_failed'));
      socket.addEventListener('error', onError, { once: true });
      socket.addEventListener('open', () => {
        socket.removeEventListener('error', onError);
        socket.send(JSON.stringify({ type: 'session.hello', token }));
        resolve(new HostConnection(socket, runtime));
      }, { once: true });
    });
  }

  command(command: CommandName, payload: Record<string, unknown> = {}): Promise<HostCommandResponse> {
    if (this.#socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('host_connection_not_open'));
    const requestId = globalThis.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      this.#socket.send(JSON.stringify({
        type: 'command.request',
        protocolVersion: 1,
        requestId,
        command,
        payload,
      }));
    });
  }

  close(): void {
    this.#socket.close();
  }

  async #onMessage(json: string): Promise<void> {
    let message: VNextEnvelope;
    try {
      message = JSON.parse(json) as VNextEnvelope;
    } catch {
      return;
    }

    if (message.type === 'command.result') {
      if (!message.requestId) return;
      const pending = this.#pending.get(message.requestId);
      if (!pending) return;
      this.#pending.delete(message.requestId);
      pending.resolve({
        accepted: message.accepted === true,
        errorCode: message.errorCode,
        payload: message.payload,
      });
      return;
    }

    switch (message.type) {
      case 'runtime.prepare':
        this.#socket.send(JSON.stringify(await this.#runtime.prepare(message)));
        break;
      case 'runtime.activate':
        this.#runtime.activate(message);
        break;
      case 'runtime.retire':
        this.#runtime.retire(message);
        break;
      default:
        break;
    }
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}
