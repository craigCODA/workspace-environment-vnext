import type { VNextEnvelope } from '@workspace/vnext-contracts';
import type { RuntimeCoordinator } from '../runtime/RuntimeCoordinator.ts';

export class HostConnection {
  readonly #socket: WebSocket;
  readonly #runtime: RuntimeCoordinator;

  private constructor(socket: WebSocket, runtime: RuntimeCoordinator) {
    this.#socket = socket;
    this.#runtime = runtime;
    socket.addEventListener('message', (event) => void this.#onMessage(String(event.data)));
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
}
