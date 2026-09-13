export interface ContentFit {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Fit the captured frame inside the screen face, leaving letterbox/pillarbox bars. */
export function containFit(displayAspect: number, frameAspect: number): ContentFit {
  if (!Number.isFinite(displayAspect) || !Number.isFinite(frameAspect) || displayAspect <= 0 || frameAspect <= 0) {
    return { u0: 0, v0: 0, u1: 1, v1: 1 };
  }
  if (frameAspect > displayAspect) {
    const height = displayAspect / frameAspect;
    const v0 = (1 - height) / 2;
    return { u0: 0, v0, u1: 1, v1: v0 + height };
  }
  const width = frameAspect / displayAspect;
  const u0 = (1 - width) / 2;
  return { u0, v0: 0, u1: u0 + width, v1: 1 };
}

export function mapUvToCapture(u: number, v: number, fit: ContentFit): { x: number; y: number } | null {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < fit.u0 || u > fit.u1 || v < fit.v0 || v > fit.v1) return null;
  const spanU = fit.u1 - fit.u0;
  const spanV = fit.v1 - fit.v0;
  if (spanU <= 0 || spanV <= 0) return null;
  return { x: (u - fit.u0) / spanU, y: (v - fit.v0) / spanV };
}

/** Plane UV uses v=0 at the bottom; capture coordinates use y=0 at the top. */
export function mapPlaneUvToCapture(u: number, v: number, fit: ContentFit): { x: number; y: number } | null {
  const mapped = mapUvToCapture(u, v, fit);
  return mapped ? { x: mapped.x, y: 1 - mapped.y } : null;
}
