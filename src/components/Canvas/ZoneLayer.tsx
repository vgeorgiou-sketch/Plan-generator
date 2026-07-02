import type { Zone } from "../../types/model";
import { pointsToPath, centroid } from "../../geometry/polygon";

interface Props {
  zones: Zone[];
  scale: number;
}

export function ZoneLayer({ zones, scale }: Props) {
  return (
    <g>
      {zones.map((zone) => {
        const c = centroid(zone.points);
        return (
          <g key={zone.id}>
            <path d={pointsToPath(zone.points)} fill="var(--zone-fill)" stroke="none" />
            <path
              d={pointsToPath(zone.points)}
              fill="none"
              stroke="var(--zone-line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              fontSize={10 / scale}
              fill="var(--zone-label)"
              fontWeight={600}
              style={{ textTransform: "uppercase" }}
            >
              {zone.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}
