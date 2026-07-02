import { useStore } from "../../store/useStore";
import { IconMinus, IconClose } from "../icons/Icons";

const TOOL_LABEL: Record<string, string> = {
  select: "Select",
  pan: "Pan",
  trace: "Trace",
  calibrate: "Calibrate",
  core: "Core",
  "zone-split": "Zone Split",
};

export function TopBar() {
  const toolMode = useStore((s) => s.toolMode);

  return (
    <div className="top-bar">
      <div className="top-bar__brand">
        <span>FLOORPLATE</span>
        <span className="divider" />
        <span className="top-bar__meta">Core comparison</span>
      </div>
      <div className="top-bar__right">
        <span className="top-bar__meta">{TOOL_LABEL[toolMode] ?? "Select"}</span>
        <button className="top-bar__icon-btn" aria-label="Minimize">
          <IconMinus size={14} />
        </button>
        <button className="top-bar__icon-btn" aria-label="Close">
          <IconClose size={14} />
        </button>
      </div>
    </div>
  );
}
