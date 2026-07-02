interface DotGridProps {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Dot texture in screen space: spacing represents 0.5m world units. */
export function DotGrid({ scale, offsetX, offsetY }: DotGridProps) {
  const spacing = 0.5 * scale;
  const x = ((offsetX % spacing) + spacing) % spacing;
  const y = ((offsetY % spacing) + spacing) % spacing;

  return (
    <>
      <defs>
        <pattern
          id="dot-grid"
          patternUnits="userSpaceOnUse"
          width={spacing}
          height={spacing}
          x={x}
          y={y}
        >
          <circle cx={1} cy={1} r={1} fill="var(--canvas-dot)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)" />
    </>
  );
}
