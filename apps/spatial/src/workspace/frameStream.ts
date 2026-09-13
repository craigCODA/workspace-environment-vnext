export type SurfacePresentation =
  | 'unbound'
  | 'connecting'
  | 'waiting'
  | 'live'
  | 'minimized'
  | 'missing'
  | 'protected'
  | 'unavailable';

export function acceptFrameSequence(last: number, incoming: number, options: { reset?: boolean } = {}): number | null {
  if (!Number.isSafeInteger(incoming) || incoming < 1) return null;
  if (options.reset) return incoming;
  if (!Number.isSafeInteger(last) || last < 0) return null;
  return incoming > last ? incoming : null;
}

export function presentCaptureStatus(status: string, hasFrame: boolean): SurfacePresentation {
  switch (status) {
    case 'unbound': return 'unbound';
    case 'waiting_for_frame': return 'waiting';
    case 'live': return 'live';
    case 'idle': return hasFrame ? 'live' : 'waiting';
    case 'window_minimized': return 'minimized';
    case 'window_missing_or_ambiguous': return 'missing';
    case 'capture_protected': return 'protected';
    default: return 'unavailable';
  }
}
