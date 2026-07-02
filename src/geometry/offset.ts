import { clipperLib, getClipper } from "./clipperInstance";
import type { Point } from "../types/model";

// The offset engine operates on integer coordinates. World units are
// metres, so we scale up before offsetting and back down after, giving
// sub-mm precision while staying well inside safe integer range for
// realistic floorplate sizes.
const SCALE = 1_000_000;

function area(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

/**
 * Offsets a closed polygon by `deltaM` (metres; negative = inward) using a
 * mitre join, returning the largest resulting ring. Used to derive the wall
 * poché inner boundary from the traced outer outline.
 */
export function offsetPolygon(points: Point[], deltaM: number): Point[] | null {
  if (points.length < 3) return null;
  const clipper = getClipper();
  const scaled = points.map((p) => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) }));

  const solution = clipper.offsetToPaths({
    delta: deltaM * SCALE,
    miterLimit: 4,
    offsetInputs: [
      { data: scaled, joinType: clipperLib.JoinType.Miter, endType: clipperLib.EndType.ClosedPolygon },
    ],
  });
  if (!solution || solution.length === 0) return null;

  let best = solution[0];
  let bestArea = area(best);
  for (const path of solution.slice(1)) {
    const a = area(path);
    if (a > bestArea) {
      best = path;
      bestArea = a;
    }
  }
  return best.map((p) => ({ x: p.x / SCALE, y: p.y / SCALE }));
}
