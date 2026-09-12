import type { CommandName } from '@workspace/vnext-contracts';
import { HostConnection, type HostCommandResponse } from '../host/HostConnection.ts';
import type { RuntimeCoordinator } from '../runtime/RuntimeCoordinator.ts';
import { readWorld, type WorldSnapshot } from './WorldSnapshot.ts';

export class WorkspaceClient {
  readonly connection: HostConnection;
  readonly #onFailure: (error: Error) => void;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  #checking = false;
  #closed = false;
  private constructor(connection: HostConnection, onFailure: (error: Error) => void) {
    this.connection = connection; this.#onFailure = onFailure;
  }
  static async connect(host: string, session: string, runtime: RuntimeCoordinator, onFailure: (error: Error) => void) {
    const client = new WorkspaceClient(await timeout(HostConnection.connect(host, session, runtime)), onFailure);
    client.#heartbeat = setInterval(() => { void client.#check(); }, 2000);
    return client;
  }
  async command(name: CommandName, payload: Record<string, unknown> = {}): Promise<HostCommandResponse> {
    const response = await timeout(this.connection.command(name, payload));
    if (!response.accepted) throw new Error(response.errorCode ?? 'Host rejected the operation.');
    return response;
  }
  async world(): Promise<WorldSnapshot> { return readWorld((await this.command('world.read')).payload); }
  close(): void { this.#closed = true; clearInterval(this.#heartbeat); this.connection.close(); }
  async #check(): Promise<void> {
    if (this.#checking || this.#closed) return;
    this.#checking = true;
    try { await this.command('world.read'); }
    catch (error) { if (!this.#closed) { this.close(); this.#onFailure(error instanceof Error ? error : new Error(String(error))); } }
    finally { this.#checking = false; }
  }
}
async function timeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The Workspace host stopped responding. Relaunch Workspace.')), 8000); })]); }
  finally { clearTimeout(timer); }
}
