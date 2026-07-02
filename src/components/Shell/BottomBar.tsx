import { useStore } from "../../store/useStore";

export function BottomBar() {
  const outline = useStore((s) => s.outline);
  const calibration = useStore((s) => s.calibration);
  const view = useStore((s) => s.view);

  return (
    <div className="bottom-bar">
      <span>
        {outline ? `Outline · ${outline.length} pts` : "No outline traced"}
      </span>
      <span>
        {calibration.locked
          ? `Scale locked · 1px = ${(1 / (calibration.pixelsPerMetre ?? 1)).toFixed(4)}m`
          : "Scale unlocked"}
      </span>
      <span>{Math.round(view.scale)}%</span>
    </div>
  );
}
