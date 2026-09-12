import type { TransformContract } from '../interaction/InteractionController.ts';
export type Vec3 = [number, number, number];
export interface ApplicationSelector {
  applicationId: string; executablePath: string; windowClass: string; titleHint: string;
}
export interface WorldEntity {
  id: string; name: string; parentId: string | null; transform: TransformContract;
  parameters: { kind: string; dimensions: Vec3; color?: string; application?: ApplicationSelector };
  revisions: { transform: number; parameters: number; implementation: number; relationships: number; packageState: number };
  packageBinding: { packageId: string; revisionDigest: string; generationToken: string; active: boolean } | null;
}
export interface WorldSnapshot {
  worldRevision: number; entities: Record<string, WorldEntity>; activeLeaseCount: number;
}
export function readWorld(value: unknown): WorldSnapshot {
  const world = value as WorldSnapshot | null;
  if (!world || !Number.isSafeInteger(world.worldRevision) || !world.entities || Array.isArray(world.entities)) throw new Error('Invalid host world snapshot.');
  return world;
}
export function connectionSettings(fragment: string): { host: string; session: string; httpBase: string } {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const host = params.get('host'); const session = params.get('session');
  if (!host || !session) throw new Error('Missing connection configuration. Launch Workspace using its desktop launcher or the complete printed URL.');
  const url = new URL(host);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.pathname !== '/workspace' || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid connection endpoint. M2A connects only to its local Workspace host.');
  }
  return { host, session, httpBase: `http://${url.host}` };
}
