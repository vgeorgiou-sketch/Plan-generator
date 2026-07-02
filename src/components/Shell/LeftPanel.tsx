import { useRef, type ReactElement } from "react";
import { useStore } from "../../store/useStore";
import type { ToolMode } from "../../types/model";
import {
  IconSelect,
  IconPan,
  IconTrace,
  IconCalibrate,
  IconCore,
  IconZoneSplit,
  IconUndo,
  IconExport,
  IconUpload,
} from "../icons/Icons";
import { loadFileAsBackground } from "../../io/loadFile";

const TOOLS: { mode: ToolMode; label: string; icon: (p: { size?: number }) => ReactElement; hint: string }[] = [
  { mode: "select", label: "Select", icon: IconSelect, hint: "V" },
  { mode: "pan", label: "Pan", icon: IconPan, hint: "H" },
  { mode: "trace", label: "Trace", icon: IconTrace, hint: "T" },
  { mode: "calibrate", label: "Calibrate", icon: IconCalibrate, hint: "C" },
  { mode: "core", label: "Core", icon: IconCore, hint: "R" },
  { mode: "zone-split", label: "Zone Split", icon: IconZoneSplit, hint: "Z" },
];

export function LeftPanel() {
  const toolMode = useStore((s) => s.toolMode);
  const setToolMode = useStore((s) => s.setToolMode);
  const undo = useStore((s) => s.undo);
  const setBackground = useStore((s) => s.setBackground);
  const setExtractedVectors = useStore((s) => s.setExtractedVectors);
  const resetCalibration = useStore((s) => s.resetCalibration);
  const pushUndo = useStore((s) => s.pushUndo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    pushUndo();
    const { background, vectorPolygons } = await loadFileAsBackground(file);
    resetCalibration();
    setBackground(background);
    setExtractedVectors(vectorPolygons);
    setToolMode("calibrate");
    e.target.value = "";
  }

  function handleExport() {
    const svg = document.querySelector(".canvas-svg") as SVGSVGElement | null;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const { width, height } = svg.getBoundingClientRect();
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "floorplate-export.png";
        a.click();
      });
    };
    img.src = url;
  }

  return (
    <div className="side-panel side-panel--left">
      <div>
        <p className="panel-section__label">Import</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <button className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
          <IconUpload size={18} />
          PDF or image
        </button>
      </div>

      <div>
        <p className="panel-section__label">Tools</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {TOOLS.map(({ mode, label, icon: Icon, hint }) => (
            <button
              key={mode}
              className={`tool-row${toolMode === mode ? " is-active" : ""}`}
              onClick={() => setToolMode(mode)}
            >
              <Icon size={18} />
              {label}
              <span className="tool-row__hint">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <button className="tool-row" onClick={() => undo()}>
          <IconUndo size={18} />
          Undo
          <span className="tool-row__hint">⌘Z</span>
        </button>
        <button className="tool-row" onClick={handleExport}>
          <IconExport size={18} />
          Export PNG
        </button>
      </div>
    </div>
  );
}
