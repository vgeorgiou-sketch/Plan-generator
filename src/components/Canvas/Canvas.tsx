import { useEffect, useRef, useState } from "react";
import { useStore, PLACEHOLDER_PX_PER_M } from "../../store/useStore";
import type { Point } from "../../types/model";
import { DotGrid } from "./DotGrid";
import { useViewport } from "./useViewport";
import { FloorplateLayer } from "./FloorplateLayer";
import { CoreLayer } from "./CoreLayer";
import { ZoneLayer } from "./ZoneLayer";
import { pointsToPath, splitPolygon } from "../../geometry/polygon";
import { nextId } from "../../store/useStore";
import { CalibrationInput } from "./CalibrationInput";

const CLOSE_THRESHOLD_PX = 12;

function rectFromCorners(a: Point, b: Point): Point[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    view,
    screenToWorld,
    clientToSvg,
    onWheel,
    startPan,
    movePan,
    endPan,
    isPanning,
  } = useViewport(svgRef);

  const toolMode = useStore((s) => s.toolMode);
  const outline = useStore((s) => s.outline);
  const wallThicknessMm = useStore((s) => s.wallThicknessMm);
  const cores = useStore((s) => s.cores);
  const zones = useStore((s) => s.zones);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const setOutline = useStore((s) => s.setOutline);
  const addCore = useStore((s) => s.addCore);
  const updateCore = useStore((s) => s.updateCore);
  const addZone = useStore((s) => s.addZone);
  const innerOutline = useStore((s) => s.innerOutline);
  const pushUndo = useStore((s) => s.pushUndo);
  const setToolMode = useStore((s) => s.setToolMode);

  const background = useStore((s) => s.background);
  const calibration = useStore((s) => s.calibration);
  const setCalibrationPoint = useStore((s) => s.setCalibrationPoint);
  const effectivePxPerM = calibration.pixelsPerMetre ?? PLACEHOLDER_PX_PER_M;

  const [tracePoints, setTracePoints] = useState<Point[]>([]);
  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);
  const [coreDraft, setCoreDraft] = useState<{ start: Point; current: Point } | null>(
    null,
  );
  const [zoneSplitPoints, setZoneSplitPoints] = useState<Point[]>([]);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [coordReadout, setCoordReadout] = useState<Point>({ x: 0, y: 0 });

  const dragRef = useRef<
    | { kind: "core-move"; id: string; start: Point; origPoints: Point[] }
    | { kind: "core-resize"; id: string; corner: number; opposite: Point }
    | null
  >(null);

  // reset transient tool state whenever the active tool changes
  useEffect(() => {
    setTracePoints([]);
    setHoverWorld(null);
    setCoreDraft(null);
    setZoneSplitPoints([]);
    setSplitError(null);
  }, [toolMode]);

  function worldFromClient(clientX: number, clientY: number): Point {
    const s = clientToSvg(clientX, clientY);
    return screenToWorld(s.x, s.y);
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const world = worldFromClient(e.clientX, e.clientY);

    if (e.button === 1 || toolMode === "pan") {
      startPan(e.clientX, e.clientY);
      return;
    }

    switch (toolMode) {
      case "trace": {
        if (tracePoints.length >= 3) {
          const s = clientToSvg(e.clientX, e.clientY);
          const first = tracePoints[0];
          const firstScreen = {
            x: first.x * view.scale + view.offsetX,
            y: first.y * view.scale + view.offsetY,
          };
          const distPx = Math.hypot(s.x - firstScreen.x, s.y - firstScreen.y);
          if (distPx < CLOSE_THRESHOLD_PX) {
            pushUndo();
            setOutline(tracePoints);
            setTracePoints([]);
            setToolMode("select");
            return;
          }
        }
        setTracePoints((pts) => [...pts, world]);
        break;
      }
      case "calibrate": {
        // calibration points are stored in background-image pixel space so
        // the computed scale is independent of the placeholder display scale
        const imagePt = { x: world.x * effectivePxPerM, y: world.y * effectivePxPerM };
        if (!calibration.pointA) {
          setCalibrationPoint("A", imagePt);
        } else if (!calibration.pointB) {
          setCalibrationPoint("B", imagePt);
        }
        break;
      }
      case "core": {
        setCoreDraft({ start: world, current: world });
        break;
      }
      case "zone-split": {
        const target = innerOutline();
        if (!target) {
          setSplitError("Trace a floorplate outline first.");
          break;
        }
        const pts = [...zoneSplitPoints, world];
        if (pts.length < 2) {
          setZoneSplitPoints(pts);
        } else {
          const result = splitPolygon(target, pts[0], pts[1]);
          if ("error" in result) {
            setSplitError(result.error);
          } else {
            pushUndo();
            addZone(
              { id: nextId("zone"), name: "Zone A", points: result.a },
              { id: nextId("zone"), name: "Zone B", points: result.b },
            );
            setSplitError(null);
          }
          setZoneSplitPoints([]);
        }
        break;
      }
      case "select": {
        setSelection(null);
        break;
      }
    }
  }

  function handleCorePointerDown(id: string, e: React.PointerEvent) {
    if (toolMode !== "select") return;
    e.stopPropagation();
    setSelection({ type: "core", id });
    const world = worldFromClient(e.clientX, e.clientY);
    const core = cores.find((c) => c.id === id);
    if (!core) return;
    pushUndo();
    dragRef.current = {
      kind: "core-move",
      id,
      start: world,
      origPoints: core.points,
    };
  }

  function handleHandlePointerDown(corner: number, e: React.PointerEvent) {
    e.stopPropagation();
    if (!selection || selection.type !== "core") return;
    const core = cores.find((c) => c.id === selection.id);
    if (!core) return;
    const oppositeIdx = (corner + 2) % 4;
    pushUndo();
    dragRef.current = {
      kind: "core-resize",
      id: core.id,
      corner,
      opposite: core.points[oppositeIdx],
    };
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (isPanning()) {
      movePan(e.clientX, e.clientY);
      return;
    }
    const world = worldFromClient(e.clientX, e.clientY);
    setCoordReadout(world);

    if (toolMode === "trace" && tracePoints.length > 0) {
      setHoverWorld(world);
    }
    if (toolMode === "core" && coreDraft) {
      setCoreDraft({ ...coreDraft, current: world });
    }
    if (toolMode === "zone-split" && zoneSplitPoints.length === 1) {
      setHoverWorld(world);
    }

    const drag = dragRef.current;
    if (drag?.kind === "core-move") {
      const dx = world.x - drag.start.x;
      const dy = world.y - drag.start.y;
      updateCore(
        drag.id,
        drag.origPoints.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      );
    } else if (drag?.kind === "core-resize") {
      updateCore(drag.id, rectFromCorners(drag.opposite, world));
    }
  }

  function handlePointerUp() {
    endPan();
    if (toolMode === "core" && coreDraft) {
      const w = Math.abs(coreDraft.current.x - coreDraft.start.x);
      const h = Math.abs(coreDraft.current.y - coreDraft.start.y);
      if (w > 0.3 && h > 0.3) {
        pushUndo();
        addCore(rectFromCorners(coreDraft.start, coreDraft.current));
      }
      setCoreDraft(null);
    }
    dragRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === "Escape") {
      setTracePoints([]);
      setZoneSplitPoints([]);
      setSplitError(null);
    } else if (e.key === "Enter" && toolMode === "trace" && tracePoints.length >= 3) {
      pushUndo();
      setOutline(tracePoints);
      setTracePoints([]);
      setToolMode("select");
    }
  }

  const cursor =
    toolMode === "pan"
      ? "grab"
      : toolMode === "select"
        ? "default"
        : "crosshair";

  return (
    <div ref={containerRef} className="canvas-container">
      <svg
        ref={svgRef}
        className="canvas-svg"
        tabIndex={0}
        style={{ cursor }}
        onWheel={onWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <rect width="100%" height="100%" fill="var(--canvas-bg)" />
        <DotGrid scale={view.scale} offsetX={view.offsetX} offsetY={view.offsetY} />

        <g transform={`translate(${view.offsetX} ${view.offsetY}) scale(${view.scale})`}>
          {background && (
            <image
              href={background.url}
              x={0}
              y={0}
              width={background.widthPx / effectivePxPerM}
              height={background.heightPx / effectivePxPerM}
              opacity={0.85}
            />
          )}

          {outline && <FloorplateLayer outline={outline} wallThicknessMm={wallThicknessMm} />}

          <ZoneLayer zones={zones} scale={view.scale} />

          <CoreLayer
            cores={cores}
            selectedId={selection?.type === "core" ? selection.id : null}
            scale={view.scale}
            interactive={toolMode === "select"}
            onCorePointerDown={handleCorePointerDown}
          />

          {selection?.type === "core" &&
            toolMode === "select" &&
            (() => {
              const core = cores.find((c) => c.id === selection.id);
              if (!core) return null;
              const r = 5 / view.scale;
              return (
                <g>
                  {core.points.map((p, i) => (
                    <rect
                      key={i}
                      x={p.x - r / 2}
                      y={p.y - r / 2}
                      width={r}
                      height={r}
                      fill="#fff"
                      stroke="var(--core-fill)"
                      strokeWidth={1.5 / view.scale}
                      style={{ cursor: "nwse-resize" }}
                      onPointerDown={(e) => handleHandlePointerDown(i, e)}
                    />
                  ))}
                </g>
              );
            })()}

          {/* trace draft */}
          {tracePoints.length > 0 && (
            <g>
              <path
                d={`M ${tracePoints[0].x} ${tracePoints[0].y} ${tracePoints
                  .slice(1)
                  .map((p) => `L ${p.x} ${p.y}`)
                  .join(" ")}`}
                fill="none"
                stroke="var(--line-strong)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {hoverWorld && (
                <line
                  x1={tracePoints[tracePoints.length - 1].x}
                  y1={tracePoints[tracePoints.length - 1].y}
                  x2={hoverWorld.x}
                  y2={hoverWorld.y}
                  stroke="var(--ink-muted)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {tracePoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={i === 0 ? 5 / view.scale : 3 / view.scale}
                  fill={i === 0 ? "var(--dim-line)" : "var(--line-strong)"}
                  stroke="none"
                />
              ))}
            </g>
          )}

          {/* core draft rectangle */}
          {coreDraft && (
            <path
              d={pointsToPath(rectFromCorners(coreDraft.start, coreDraft.current))}
              fill="rgba(30,35,64,0.15)"
              stroke="var(--core-fill)"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* zone split preview */}
          {toolMode === "zone-split" && zoneSplitPoints.length === 1 && hoverWorld && (
            <line
              x1={zoneSplitPoints[0].x}
              y1={zoneSplitPoints[0].y}
              x2={hoverWorld.x}
              y2={hoverWorld.y}
              stroke="var(--dim-line)"
              strokeWidth={0.75}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* calibration — stored in image-pixel space, displayed at effectivePxPerM */}
          {(calibration.pointA || calibration.pointB) &&
            (() => {
              const a = calibration.pointA
                ? { x: calibration.pointA.x / effectivePxPerM, y: calibration.pointA.y / effectivePxPerM }
                : null;
              const b = calibration.pointB
                ? { x: calibration.pointB.x / effectivePxPerM, y: calibration.pointB.y / effectivePxPerM }
                : null;
              return (
                <g>
                  {a && b && (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="var(--dim-line)"
                      strokeWidth={0.75}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {a && <circle cx={a.x} cy={a.y} r={5 / view.scale} fill="var(--calibration-dot)" />}
                  {b && <circle cx={b.x} cy={b.y} r={5 / view.scale} fill="var(--calibration-dot)" />}
                </g>
              );
            })()}
        </g>
      </svg>

      {splitError && <div className="canvas-toast">{splitError}</div>}

      {toolMode === "calibrate" && calibration.pointA && calibration.pointB && !calibration.locked && (
        <CalibrationInput />
      )}

      <div className="canvas-coord-readout">
        X {coordReadout.x.toFixed(2)}m &nbsp; Y {coordReadout.y.toFixed(2)}m &nbsp;·&nbsp;{" "}
        {Math.round(view.scale * 100) / 100}px/m
      </div>
    </div>
  );
}
