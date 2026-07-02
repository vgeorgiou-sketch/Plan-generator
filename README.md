# Floorplate — core comparison tool

A client-facing tool for comparing vertical-circulation core options against a
digitised floorplate outline, with live GIA / NIA / efficiency figures.

## Stack

- React + TypeScript + Vite, zustand for state (with an undo snapshot stack)
- SVG canvas rendering, `vector-effect="non-scaling-stroke"` throughout for
  crisp linework at any zoom
- `js-angusj-clipper` (WASM Clipper port) for mitre-join polygon offsetting,
  used to derive the wall poché from a traced centerline outline
- `pdfjs-dist` for client-side vector PDF extraction (operator-list walk with
  a CTM stack) and raster page rendering as a trace/calibration background

## Workflow

1. **Import** a PDF or image (left panel) — renders as a background and, for
   vector PDFs, extracts candidate outline polygons.
2. **Calibrate** — click two points on the background and enter the real
   distance between them to lock the scale before tracing.
3. **Trace** the floorplate outline (or accept an extracted PDF polygon).
   Wall thickness (right panel) drives the poché fill via a Clipper2 inward
   offset.
4. **Core** tool: drag to place one or more named core options. One is
   "active" and drives the live NIA calc; the rest render as dashed ghosts
   for client-facing comparison.
5. **Zone Split**: click two points to divide the floorplate into leasable
   zones.
6. **Undo** (⌘/Ctrl+Z) and **Export PNG** are available at any point.

Hotkeys: `V` select · `H` pan · `T` trace · `C` calibrate · `R` core · `Z` zone split.

## Known gaps (see project brief)

- Area logic is a simplified IPMS 3 approximation (GIA − active core), not a
  full configurable exclusion rule engine (core / limited-use / structure).
- DWG import is not implemented (needs a server-side conversion step).
- Structural column grid and dimension annotation tools are data-model-ready
  but not yet exposed in the UI.

## Development

```bash
npm install
npm run dev
```
