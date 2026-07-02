import type { Point } from "../types/model";

/** Shoelace formula. Positive = counter-clockwise winding. */
export function signedArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function area(points: Point[]): number {
  return Math.abs(signedArea(points));
}

export function centroid(points: Point[]): Point {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
    a += cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    const n = points.length || 1;
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return (
    `M ${first.x} ${first.y} ` +
    rest.map((p) => `L ${p.x} ${p.y}`).join(" ") +
    " Z"
  );
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Bounded segment-vs-infinite-line intersection. Returns t along the line and s along the segment. */
function intersectSegmentWithLine(
  segA: Point,
  segB: Point,
  lineP: Point,
  lineDir: Point,
): { point: Point; s: number } | null {
  const ex = segB.x - segA.x;
  const ey = segB.y - segA.y;
  const denom = lineDir.x * ey - lineDir.y * ex;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const dx = segA.x - lineP.x;
  const dy = segA.y - lineP.y;
  const s = (lineDir.y * dx - lineDir.x * dy) / denom;
  if (s < -1e-9 || s > 1 + 1e-9) return null; // outside segment
  return {
    point: { x: segA.x + s * ex, y: segA.y + s * ey },
    s,
  };
}

/**
 * Splits a closed polygon into two polygons using a line defined by two
 * points (the line is extended infinitely in both directions). Expects
 * exactly two edge intersections; rejects otherwise.
 */
export function splitPolygon(
  points: Point[],
  linePointA: Point,
  linePointB: Point,
): { a: Point[]; b: Point[] } | { error: string } {
  const dir = { x: linePointB.x - linePointA.x, y: linePointB.y - linePointA.y };
  if (Math.hypot(dir.x, dir.y) < 1e-9) {
    return { error: "Split line has zero length." };
  }

  const hits: { edgeIndex: number; point: Point }[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const hit = intersectSegmentWithLine(a, b, linePointA, dir);
    if (hit) {
      // avoid double-counting a hit that lands exactly on a shared vertex
      const dupe = hits.some((h) => distance(h.point, hit.point) < 1e-6);
      if (!dupe) hits.push({ edgeIndex: i, point: hit.point });
    }
  }

  if (hits.length !== 2) {
    return {
      error: `Split line must cross the polygon boundary exactly twice (found ${hits.length}).`,
    };
  }

  hits.sort((h1, h2) => h1.edgeIndex - h2.edgeIndex);
  const [h1, h2] = hits;

  const chainA: Point[] = [h1.point];
  for (let i = h1.edgeIndex + 1; i <= h2.edgeIndex; i++) {
    chainA.push(points[i % n]);
  }
  chainA.push(h2.point);

  const chainB: Point[] = [h2.point];
  for (let i = h2.edgeIndex + 1; i <= h1.edgeIndex + n; i++) {
    chainB.push(points[i % n]);
  }
  chainB.push(h1.point);

  return { a: chainA, b: chainB };
}

export function polygonBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Point-in-polygon, even-odd rule. */
export function pointInPolygon(pt: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
