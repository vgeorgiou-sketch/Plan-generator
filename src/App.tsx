import { useEffect } from "react";
import "./styles/shell.css";
import { TopBar } from "./components/Shell/TopBar";
import { LeftPanel } from "./components/Shell/LeftPanel";
import { RightPanel } from "./components/Shell/RightPanel";
import { BottomBar } from "./components/Shell/BottomBar";
import { Canvas } from "./components/Canvas/Canvas";
import { useStore } from "./store/useStore";
import type { ToolMode } from "./types/model";

const HOTKEYS: Record<string, ToolMode> = {
  v: "select",
  h: "pan",
  t: "trace",
  c: "calibrate",
  r: "core",
  z: "zone-split",
};

function App() {
  const setToolMode = useStore((s) => s.setToolMode);
  const undo = useStore((s) => s.undo);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(target.tagName)) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      const mode = HOTKEYS[e.key.toLowerCase()];
      if (mode) setToolMode(mode);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setToolMode, undo]);

  return (
    <div className="app-shell">
      <TopBar />
      <LeftPanel />
      <Canvas />
      <RightPanel />
      <BottomBar />
    </div>
  );
}

export default App;
