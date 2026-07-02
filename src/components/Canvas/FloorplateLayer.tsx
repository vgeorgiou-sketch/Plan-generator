import { useMemo } from "react";
import type { Point } from "../../types/model";
import { pointsToPath } from "../../geometry/polygon";
import { offsetPolygon } from "../../geometry/offset";

interface Props {
  outline: Point[];
  wallThicknessMm: number;
}

export function FloorplateLayer({ outline, wallThicknessMm }: Props) {
  const inner = useMemo(
    () => offsetPolygon(outline, -wallThicknessMm / 1000),
    [outline, wallThicknessMm],
  );

  const outerPath = pointsToPath(outline);
  const innerPath = inner ? pointsToPath(inner) : "";
  const compound = inner ? `${outerPath} ${innerPath}` : outerPath;

  return (
    <g>
      <path d={compound} fill="var(--poche-fill)" fillRule="evenodd" stroke="none" />
      <path
        d={outerPath}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {inner && (
        <path
          d={innerPath}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}
