import { useState } from "react";
import { useStore } from "../../store/useStore";

export function CalibrationInput() {
  const [value, setValue] = useState("");
  const setCalibrationDistance = useStore((s) => s.setCalibrationDistance);
  const lockCalibration = useStore((s) => s.lockCalibration);
  const resetCalibration = useStore((s) => s.resetCalibration);
  const setToolMode = useStore((s) => s.setToolMode);

  function handleLock() {
    const m = parseFloat(value);
    if (!m || m <= 0) return;
    setCalibrationDistance(m);
    lockCalibration();
    setToolMode("select");
  }

  return (
    <div className="calibration-input">
      <span>Real-world distance between points</span>
      <input
        autoFocus
        type="number"
        step="0.01"
        min="0"
        value={value}
        placeholder="metres"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLock()}
      />
      <button onClick={handleLock}>Lock scale</button>
      <button className="ghost" onClick={() => resetCalibration()}>
        Cancel
      </button>
    </div>
  );
}
