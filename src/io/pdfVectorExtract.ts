import { pdfjsLib } from "./pdf";

export interface PxPoint {
  x: number;
  y: number;
}

type Matrix = [number, number, number, number, number, number];

function applyMatrix(m: Matrix, x: number, y: number): PxPoint {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Composes m1 (outer/current CTM) with m2 (operand of a `cm` op): m1 ∘ m2. */
function composeMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Extracts straight-edge subpaths from a pdf.js operator list, applying the
 * CTM stack (save/restore/transform) so every point lands in viewport pixel
 * space. Curves are approximated by their endpoint only — adequate for
 * CAD-exported architectural drawings, which are overwhelmingly straight
 * lines and rectangles.
 */
export function extractVectorPolygons(
  fnArray: number[],
  argsArray: unknown[][],
  viewportTransform: number[],
): PxPoint[][] {
  const OPS = pdfjsLib.OPS;
  const stack: Matrix[] = [viewportTransform.slice() as Matrix];
  const polygons: PxPoint[][] = [];

  const top = () => stack[stack.length - 1];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === OPS.save) {
      stack.push(top().slice() as Matrix);
    } else if (fn === OPS.restore) {
      if (stack.length > 1) stack.pop();
    } else if (fn === OPS.transform) {
      const m2 = args as unknown as Matrix;
      stack[stack.length - 1] = composeMatrix(top(), m2);
    } else if (fn === OPS.constructPath) {
      const [subOps, coords] = args as [number[], number[]];
      let idx = 0;
      let path: PxPoint[] = [];

      for (const subOp of subOps) {
        if (subOp === OPS.moveTo) {
          if (path.length > 1) polygons.push(path);
          const x = coords[idx++];
          const y = coords[idx++];
          path = [applyMatrix(top(), x, y)];
        } else if (subOp === OPS.lineTo) {
          const x = coords[idx++];
          const y = coords[idx++];
          path.push(applyMatrix(top(), x, y));
        } else if (subOp === OPS.curveTo) {
          idx += 4; // skip both control points
          const x = coords[idx++];
          const y = coords[idx++];
          path.push(applyMatrix(top(), x, y));
        } else if (subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
          idx += 2; // skip single control point
          const x = coords[idx++];
          const y = coords[idx++];
          path.push(applyMatrix(top(), x, y));
        } else if (subOp === OPS.rectangle) {
          const x = coords[idx++];
          const y = coords[idx++];
          const w = coords[idx++];
          const h = coords[idx++];
          if (path.length > 1) polygons.push(path);
          const p1 = applyMatrix(top(), x, y);
          const p2 = applyMatrix(top(), x + w, y);
          const p3 = applyMatrix(top(), x + w, y + h);
          const p4 = applyMatrix(top(), x, y + h);
          polygons.push([p1, p2, p3, p4, p1]);
          path = [];
        } else if (subOp === OPS.closePath) {
          if (path.length > 1) {
            path.push(path[0]);
            polygons.push(path);
          }
          path = [];
        }
      }
      if (path.length > 1) polygons.push(path);
    }
  }

  return polygons;
}

export async function extractFirstPageVectors(
  pdf: pdfjsLib.PDFDocumentProxy,
  viewport: { transform: number[] },
): Promise<PxPoint[][]> {
  const page = await pdf.getPage(1);
  const opList = await page.getOperatorList();
  return extractVectorPolygons(
    opList.fnArray as unknown as number[],
    opList.argsArray as unknown as unknown[][],
    viewport.transform,
  );
}
