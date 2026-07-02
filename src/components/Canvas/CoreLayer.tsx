import type { PointerEvent as ReactPointerEvent } from "react";
import type { CoreOption } from "../../types/model";
import { pointsToPath, polygonBounds, centroid } from "../../geometry/polygon";

interface Props {
  cores: CoreOption[];
  selectedId: string | null;
  scale: number;
  interactive?: boolean;
  onCorePointerDown?: (id: string, e: ReactPointerEvent) => void;
}

function CoreSymbols({ core }: { core: CoreOption }) {
  const b = polygonBounds(core.points);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (w < 1.2 || h < 1.2) return null;

  const pad = Math.min(w, h) * 0.1;
  const gx = b.minX + pad;
  const gy = b.minY + pad;
  const gw = w - pad * 2;
  const gh = h - pad * 2;
  const cols = 2;
  const rows = 2;
  const cw = gw / cols;
  const ch = gh / rows;
  const gap = Math.min(cw, ch) * 0.12;

  const cells: { x: number; y: number; w: number; h: number; kind: "lift" | "stair" }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: gx + c * cw + gap / 2,
        y: gy + r * ch + gap / 2,
        w: cw - gap,
        h: ch - gap,
        kind: r === 0 ? "lift" : "stair",
      });
    }
  }

  return (
    <g stroke="var(--core-line)" strokeWidth={0.5} fill="none" vectorEffect="non-scaling-stroke">
      {cells.map((cell, i) => (
        <g key={i}>
          <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} vectorEffect="non-scaling-stroke" />
          {cell.kind === "lift" ? (
            <path
              d={`M ${cell.x} ${cell.y} L ${cell.x + cell.w} ${cell.y + cell.h} M ${cell.x + cell.w} ${cell.y} L ${cell.x} ${cell.y + cell.h}`}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <g vectorEffect="non-scaling-stroke">
              {[0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={cell.x}
                  y1={cell.y + cell.h * t}
                  x2={cell.x + cell.w}
                  y2={cell.y + cell.h * (t - 0.2)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          )}
        </g>
      ))}
    </g>
  );
}

export function CoreLayer({ cores, selectedId, scale, interactive, onCorePointerDown }: Props) {
  return (
    <g>
      {cores
        .filter((c) => !c.active)
        .map((core) => {
          const c = centroid(core.points);
          return (
            <g
              key={core.id}
              opacity={core.id === selectedId ? 1 : 0.9}
              style={{ cursor: interactive ? "pointer" : undefined }}
              onPointerDown={(e) => onCorePointerDown?.(core.id, e)}
            >
              <path
                d={pointsToPath(core.points)}
                fill="none"
                stroke="var(--ghost-core-line)"
                strokeWidth={1}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
              <path d={pointsToPath(core.points)} fill="transparent" stroke="none" />
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                fontSize={9 / scale}
                fill="var(--ghost-core-label)"
                fontWeight={500}
                letterSpacing={0.08}
                style={{ textTransform: "uppercase" }}
              >
                {core.name}
              </text>
            </g>
          );
        })}

      {cores
        .filter((c) => c.active)
        .map((core) => {
          const c = centroid(core.points);
          return (
            <g
              key={core.id}
              style={{ cursor: interactive ? "move" : undefined }}
              onPointerDown={(e) => onCorePointerDown?.(core.id, e)}
            >
              <path d={pointsToPath(core.points)} fill="var(--core-fill)" stroke="none" />
              <path
                d={pointsToPath(core.points)}
                fill="none"
                stroke={core.id === selectedId ? "#fff" : "var(--core-line)"}
                strokeWidth={core.id === selectedId ? 1.5 : 1}
                vectorEffect="non-scaling-stroke"
              />
              <CoreSymbols core={core} />
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                fontSize={10 / scale}
                fill="var(--core-label)"
                fontWeight={600}
                style={{ textTransform: "uppercase" }}
              >
                {core.name}
              </text>
            </g>
          );
        })}
    </g>
  );
}
