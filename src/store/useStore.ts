import { create } from "zustand";
import type {
  AppState,
  CoreOption,
  Point,
  ToolMode,
  Zone,
} from "../types/model";
import { area } from "../geometry/polygon";
import { offsetPolygon } from "../geometry/offset";

/** Image-pixel-per-metre used to display a freshly loaded background before
 * calibration has been locked; purely a visual placeholder. */
export const PLACEHOLDER_PX_PER_M = 50;

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// Fields that participate in the undo stack. Deliberately excludes
// transient UI state like toolMode/selection/view.
type Snapshot = Pick<
  AppState,
  | "outline"
  | "wallThicknessMm"
  | "cores"
  | "zones"
  | "columns"
  | "dimensions"
  | "background"
  | "calibration"
>;

function snapshotOf(s: AppState): Snapshot {
  return {
    outline: s.outline,
    wallThicknessMm: s.wallThicknessMm,
    cores: s.cores,
    zones: s.zones,
    columns: s.columns,
    dimensions: s.dimensions,
    background: s.background,
    calibration: s.calibration,
  };
}

interface Actions {
  setToolMode: (m: ToolMode) => void;
  setSelection: (sel: AppState["selection"]) => void;

  pushUndo: () => void;
  undo: () => void;
  canUndo: () => boolean;

  setOutline: (points: Point[] | null) => void;
  setWallThickness: (mm: number) => void;

  addCore: (points: Point[]) => void;
  updateCore: (id: string, points: Point[]) => void;
  renameCore: (id: string, name: string) => void;
  setActiveCore: (id: string) => void;
  removeCore: (id: string) => void;

  addZone: (a: Zone, b: Zone) => void;
  removeZone: (id: string) => void;

  setBackground: (bg: AppState["background"]) => void;
  setExtractedVectors: (polys: Point[][]) => void;
  applyExtractedOutline: (index: number) => void;
  setCalibrationPoint: (which: "A" | "B", pt: Point | null) => void;
  setCalibrationDistance: (m: number | null) => void;
  lockCalibration: () => void;
  resetCalibration: () => void;

  setView: (v: Partial<AppState["view"]>) => void;

  computedAreas: () => { gia: number; nia: number; efficiency: number };
  innerOutline: () => Point[] | null;
}

const initialState: AppState = {
  toolMode: "select",
  background: null,
  calibration: {
    pointA: null,
    pointB: null,
    realDistanceM: null,
    pixelsPerMetre: null,
    locked: false,
  },
  extractedVectors: [],
  outline: null,
  wallThicknessMm: 215,
  cores: [],
  zones: [],
  columns: [],
  dimensions: [],
  measurementStandard: "ipms3",
  exclusions: { core: true, limitedUse: true, structure: false },
  selection: null,
  view: { scale: 60, offsetX: 0, offsetY: 0 },
};

export const useStore = create<AppState & Actions & { undoStack: Snapshot[] }>(
  (set, get) => ({
    ...initialState,
    undoStack: [],

    setToolMode: (m) => set({ toolMode: m, selection: null }),
    setSelection: (sel) => set({ selection: sel }),

    pushUndo: () =>
      set((s) => ({ undoStack: [...s.undoStack, snapshotOf(s)].slice(-50) })),

    undo: () =>
      set((s) => {
        if (s.undoStack.length === 0) return s;
        const prev = s.undoStack[s.undoStack.length - 1];
        return { ...s, ...prev, undoStack: s.undoStack.slice(0, -1) };
      }),

    canUndo: () => get().undoStack.length > 0,

    setOutline: (points) => set({ outline: points }),
    setWallThickness: (mm) => set({ wallThicknessMm: mm }),

    addCore: (points) =>
      set((s) => {
        const core: CoreOption = {
          id: nextId("core"),
          name: `Option ${String.fromCharCode(65 + s.cores.length)}`,
          points,
          active: s.cores.length === 0,
        };
        return { cores: [...s.cores, core], selection: { type: "core", id: core.id } };
      }),

    updateCore: (id, points) =>
      set((s) => ({
        cores: s.cores.map((c) => (c.id === id ? { ...c, points } : c)),
      })),

    renameCore: (id, name) =>
      set((s) => ({ cores: s.cores.map((c) => (c.id === id ? { ...c, name } : c)) })),

    setActiveCore: (id) =>
      set((s) => ({
        cores: s.cores.map((c) => ({ ...c, active: c.id === id })),
      })),

    removeCore: (id) =>
      set((s) => {
        const remaining = s.cores.filter((c) => c.id !== id);
        if (remaining.length > 0 && !remaining.some((c) => c.active)) {
          remaining[0] = { ...remaining[0], active: true };
        }
        return {
          cores: remaining,
          selection: s.selection?.id === id ? null : s.selection,
        };
      }),

    addZone: (a, b) =>
      set((s) => ({ zones: [...s.zones, a, b] })),

    removeZone: (id) =>
      set((s) => ({ zones: s.zones.filter((z) => z.id !== id) })),

    setBackground: (bg) => set({ background: bg }),
    setExtractedVectors: (polys) => set({ extractedVectors: polys }),

    applyExtractedOutline: (index) =>
      set((s) => {
        const px = s.extractedVectors[index];
        const ppm = s.calibration.pixelsPerMetre;
        if (!px || !ppm) return s;
        const outline = px.map((p) => ({ x: p.x / ppm, y: p.y / ppm }));
        return { outline };
      }),

    setCalibrationPoint: (which, pt) =>
      set((s) => ({
        calibration: {
          ...s.calibration,
          pointA: which === "A" ? pt : s.calibration.pointA,
          pointB: which === "B" ? pt : s.calibration.pointB,
        },
      })),

    setCalibrationDistance: (m) =>
      set((s) => ({ calibration: { ...s.calibration, realDistanceM: m } })),

    lockCalibration: () =>
      set((s) => {
        const { pointA, pointB, realDistanceM } = s.calibration;
        if (!pointA || !pointB || !realDistanceM || realDistanceM <= 0) return s;
        const pxDist = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
        const pixelsPerMetre = pxDist / realDistanceM;
        return {
          calibration: { ...s.calibration, pixelsPerMetre, locked: true },
        };
      }),

    resetCalibration: () =>
      set({
        calibration: {
          pointA: null,
          pointB: null,
          realDistanceM: null,
          pixelsPerMetre: null,
          locked: false,
        },
      }),

    setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),

    innerOutline: () => {
      const s = get();
      if (!s.outline) return null;
      return offsetPolygon(s.outline, -s.wallThicknessMm / 1000);
    },

    computedAreas: () => {
      const s = get();
      const inner = s.innerOutline();
      const gia = inner ? area(inner) : 0;
      const activeCore = s.cores.find((c) => c.active);
      const coreArea = activeCore ? area(activeCore.points) : 0;
      const nia = s.exclusions.core ? Math.max(gia - coreArea, 0) : gia;
      const efficiency = gia > 0 ? (nia / gia) * 100 : 0;
      return { gia, nia, efficiency };
    },
  }),
);
