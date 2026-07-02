export interface Point {
  x: number; // world units: metres
  y: number;
}

export type ToolMode =
  | "select"
  | "pan"
  | "trace"
  | "calibrate"
  | "core"
  | "zone-split";

export type MeasurementStandard = "ipms3" | "comp";

export interface ExclusionRules {
  core: boolean;
  limitedUse: boolean;
  structure: boolean;
}

export interface CoreOption {
  id: string;
  name: string;
  points: Point[]; // closed polygon, world units
  active: boolean;
}

export interface Zone {
  id: string;
  name: string;
  points: Point[];
}

export interface Column {
  id: string;
  x: number;
  y: number;
  diameterM: number;
}

export interface Dimension {
  id: string;
  a: Point;
  b: Point;
  label: string;
}

export interface BackgroundImage {
  url: string;
  widthPx: number;
  heightPx: number;
}

export interface Calibration {
  pointA: Point | null; // in background-image pixel space
  pointB: Point | null;
  realDistanceM: number | null;
  pixelsPerMetre: number | null; // background image px per metre
  locked: boolean;
}

export interface AppState {
  toolMode: ToolMode;

  background: BackgroundImage | null;
  calibration: Calibration;
  extractedVectors: Point[][];

  outline: Point[] | null; // closed polygon, world units (metres)
  wallThicknessMm: number;

  cores: CoreOption[];
  zones: Zone[];
  columns: Column[];
  dimensions: Dimension[];

  measurementStandard: MeasurementStandard;
  exclusions: ExclusionRules;

  selection: { type: "core" | "zone" | "outline"; id: string } | null;

  view: {
    scale: number; // screen px per world metre
    offsetX: number; // screen px
    offsetY: number;
  };
}
