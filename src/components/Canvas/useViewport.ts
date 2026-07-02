import { useCallback, useRef } from "react";
import { useStore } from "../../store/useStore";
import type { Point } from "../../types/model";

const MIN_SCALE = 6;
const MAX_SCALE = 800;

export function useViewport(svgRef: React.RefObject<SVGSVGElement | null>) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);

  const screenToWorld = useCallback(
    (sx: number, sy: number): Point => ({
      x: (sx - view.offsetX) / view.scale,
      y: (sy - view.offsetY) / view.scale,
    }),
    [view],
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number): Point => ({
      x: wx * view.scale + view.offsetX,
      y: wy * view.scale + view.offsetY,
    }),
    [view],
  );

  const clientToSvg = useCallback(
    (clientX: number, clientY: number): Point => {
      const el = svgRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [svgRef],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const { x: sx, y: sy } = clientToSvg(e.clientX, e.clientY);
      const worldBefore = screenToWorld(sx, sy);
      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, view.scale * zoomFactor),
      );
      const newOffsetX = sx - worldBefore.x * newScale;
      const newOffsetY = sy - worldBefore.y * newScale;
      setView({ scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY });
    },
    [clientToSvg, screenToWorld, setView, view.scale],
  );

  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );

  const startPan = useCallback(
    (clientX: number, clientY: number) => {
      panRef.current = {
        startX: clientX,
        startY: clientY,
        ox: view.offsetX,
        oy: view.offsetY,
      };
    },
    [view.offsetX, view.offsetY],
  );

  const movePan = useCallback(
    (clientX: number, clientY: number) => {
      if (!panRef.current) return;
      const dx = clientX - panRef.current.startX;
      const dy = clientY - panRef.current.startY;
      setView({ offsetX: panRef.current.ox + dx, offsetY: panRef.current.oy + dy });
    },
    [setView],
  );

  const endPan = useCallback(() => {
    panRef.current = null;
  }, []);

  const isPanning = () => panRef.current !== null;

  return {
    view,
    screenToWorld,
    worldToScreen,
    clientToSvg,
    onWheel,
    startPan,
    movePan,
    endPan,
    isPanning,
  };
}
