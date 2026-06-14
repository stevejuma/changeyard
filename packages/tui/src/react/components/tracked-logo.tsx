import { useEffect, useState } from "react";
import { palette } from "../palette";

const frames = ["CY", "C>", "CY", "<Y"];

export function TrackedLogo() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);
  const frame = frames[tick % frames.length] ?? "CY";
  const offset = Math.max(-2, Math.min(2, Math.floor((mouse.x - 40) / 20)));
  return (
    <box
      flexDirection="column"
      alignItems="center"
      onMouseMove={(event) => {
        setMouse({ x: Number(event.x ?? 0), y: Number(event.y ?? 0) });
      }}
    >
      <box marginLeft={Math.max(0, offset + 2)}>
        <text fg={palette.accent}>
          <strong>{`[ ${frame} ]`}</strong>
        </text>
      </box>
    </box>
  );
}
