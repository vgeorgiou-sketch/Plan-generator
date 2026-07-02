import { useStore } from "../../store/useStore";
import { area, polygonBounds } from "../../geometry/polygon";
import { IconClose } from "../icons/Icons";
import type { MeasurementStandard } from "../../types/model";

function fmtArea(m2: number): string {
  return m2.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function CorePropertyPanel({ id }: { id: string }) {
  const core = useStore((s) => s.cores.find((c) => c.id === id));
  const renameCore = useStore((s) => s.renameCore);
  const setActiveCore = useStore((s) => s.setActiveCore);
  const removeCore = useStore((s) => s.removeCore);
  const setSelection = useStore((s) => s.setSelection);

  if (!core) return null;
  const b = polygonBounds(core.points);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;

  return (
    <div className="side-panel side-panel--right">
      <div className="field">
        <p className="panel-section__label">Core option</p>
        <input
          className="text-input"
          value={core.name}
          onChange={(e) => renameCore(core.id, e.target.value)}
        />
      </div>

      <div className="field">
        <div className="field__row">
          <span className="field__label">Width</span>
          <span className="field__value">{w.toFixed(2)} m</span>
        </div>
        <div className="field__row">
          <span className="field__label">Depth</span>
          <span className="field__value">{h.toFixed(2)} m</span>
        </div>
        <div className="field__row">
          <span className="field__label">Area</span>
          <span className="field__value">{fmtArea(area(core.points))} m²</span>
        </div>
      </div>

      <button
        className={`core-list-item__active-btn${core.active ? " is-active" : ""}`}
        style={{ width: "100%", padding: "8px", fontSize: 11 }}
        onClick={() => setActiveCore(core.id)}
      >
        {core.active ? "Active option" : "Set as active"}
      </button>

      <button
        className="tool-row"
        onClick={() => {
          removeCore(core.id);
          setSelection(null);
        }}
      >
        <IconClose size={16} />
        Delete option
      </button>
    </div>
  );
}

function StandardSegmented() {
  const value = useStore((s) => s.measurementStandard);
  return (
    <div className="segmented">
      {(["ipms3", "comp"] as MeasurementStandard[]).map((v) => (
        <button
          key={v}
          className={value === v ? "is-active" : ""}
          onClick={() => useStore.setState({ measurementStandard: v })}
        >
          {v === "ipms3" ? "IPMS 3" : "CoMP"}
        </button>
      ))}
    </div>
  );
}

function GlobalPropertyPanel() {
  const wallThicknessMm = useStore((s) => s.wallThicknessMm);
  const setWallThickness = useStore((s) => s.setWallThickness);
  const cores = useStore((s) => s.cores);
  const zones = useStore((s) => s.zones);
  const outline = useStore((s) => s.outline);
  const exclusions = useStore((s) => s.exclusions);
  const setActiveCore = useStore((s) => s.setActiveCore);
  const removeCore = useStore((s) => s.removeCore);
  const setSelection = useStore((s) => s.setSelection);
  const removeZone = useStore((s) => s.removeZone);
  const computedAreas = useStore((s) => s.computedAreas);
  const extractedVectors = useStore((s) => s.extractedVectors);
  const calibration = useStore((s) => s.calibration);
  const applyExtractedOutline = useStore((s) => s.applyExtractedOutline);

  const { gia, nia, efficiency } = computedAreas();

  return (
    <div className="side-panel side-panel--right">
      {!outline && extractedVectors.length > 0 && calibration.locked && (
        <div>
          <p className="panel-section__label">Extracted geometry</p>
          <p className="empty-hint">
            {extractedVectors.length} vector path{extractedVectors.length === 1 ? "" : "s"} found in
            the PDF.
          </p>
          <button
            className="tool-row"
            style={{ marginTop: 8 }}
            onClick={() => {
              let bestIdx = 0;
              let bestArea = 0;
              extractedVectors.forEach((p, i) => {
                const a = area(p);
                if (a > bestArea) {
                  bestArea = a;
                  bestIdx = i;
                }
              });
              applyExtractedOutline(bestIdx);
            }}
          >
            Use largest as outline
          </button>
        </div>
      )}

      <div>
        <p className="panel-section__label">Wall</p>
        <div className="field">
          <div className="field__row">
            <span className="field__label">Thickness</span>
            <span className="field__value">{wallThicknessMm} mm</span>
          </div>
          <input
            className="slider"
            type="range"
            min={75}
            max={400}
            step={5}
            value={wallThicknessMm}
            onChange={(e) => setWallThickness(Number(e.target.value))}
          />
        </div>
      </div>

      <div>
        <p className="panel-section__label">Measurement</p>
        <StandardSegmented />
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <label className="checkbox-row">
            <input type="checkbox" checked={exclusions.core} readOnly />
            Exclude core (stairs / lifts / risers)
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={exclusions.limitedUse} readOnly />
            Flag limited-use areas
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={exclusions.structure} readOnly />
            Exclude structure
          </label>
        </div>
      </div>

      <div className="stat-group">
        <div className="stat">
          <span className="stat__label">GIA</span>
          <span className="stat__value">
            {fmtArea(gia)}
            <span className="stat__unit">m²</span>
          </span>
        </div>
        <hr className="divider-line" />
        <div className="stat">
          <span className="stat__label">NIA (active option)</span>
          <span className="stat__value">
            {fmtArea(nia)}
            <span className="stat__unit">m²</span>
          </span>
        </div>
        <hr className="divider-line" />
        <div className="stat">
          <span className="stat__label">Efficiency</span>
          <span className="stat__value">
            {efficiency.toFixed(1)}
            <span className="stat__unit">%</span>
          </span>
        </div>
      </div>

      <div>
        <p className="panel-section__label">Core options</p>
        {cores.length === 0 ? (
          <p className="empty-hint">Draw a core with the Core tool to compare layouts.</p>
        ) : (
          <div className="core-list">
            {cores.map((c) => (
              <div
                key={c.id}
                className={`core-list-item${c.active ? " is-selected" : ""}`}
                onClick={() => setSelection({ type: "core", id: c.id })}
              >
                <div className="core-list-item__top">
                  <span
                    className="core-list-item__dot"
                    style={{ background: c.active ? "var(--core-fill)" : "var(--ghost-core-line)" }}
                  />
                  <span className="core-list-item__name">{c.name}</span>
                  <span className="field__value" style={{ fontSize: 10, flexShrink: 0 }}>
                    {fmtArea(area(c.points))} m²
                  </span>
                </div>
                <div className="core-list-item__bottom">
                  <button
                    className={`core-list-item__active-btn${c.active ? " is-active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCore(c.id);
                    }}
                  >
                    {c.active ? "Active" : "Use"}
                  </button>
                  <button
                    className="core-list-item__remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCore(c.id);
                    }}
                  >
                    <IconClose size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {zones.length > 0 && (
        <div>
          <p className="panel-section__label">Zones</p>
          <div className="core-list">
            {zones.map((z) => (
              <div key={z.id} className="core-list-item">
                <div className="core-list-item__top">
                  <span className="core-list-item__dot" style={{ background: "var(--zone-line)" }} />
                  <span className="core-list-item__name">{z.name}</span>
                  <span className="field__value" style={{ fontSize: 10, flexShrink: 0 }}>
                    {fmtArea(area(z.points))} m²
                  </span>
                  <button className="core-list-item__remove" onClick={() => removeZone(z.id)}>
                    <IconClose size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RightPanel() {
  const selection = useStore((s) => s.selection);
  if (selection?.type === "core") {
    return <CorePropertyPanel id={selection.id} />;
  }
  return <GlobalPropertyPanel />;
}
