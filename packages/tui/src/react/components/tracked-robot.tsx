import { useCallback, useEffect, useRef, useState } from "react";
import { palette } from "../palette";

const FRAMES = [
  [
    "      @@      ",
    "    @@@@@@    ",
    "  @@@@@@@@@@  ",
    " @@@@@@@@@@@@ ",
    "@@@@@@@@@@@@@@",
    "@@@@  @@  @@@@",
    "@@@@  @@  @@@@",
    " @@@@@@@@@@@@ ",
    "  @@@@@@@@@@  ",
    "    @@@@@@.   ",
  ],
  [
    "      @@      ",
    "    @@@@@@    ",
    "  @@@@@@@@@@  ",
    " @@@@@@@@@@@@ ",
    "@@@@@@@@@@@@@@",
    "@@@  @@@@  @@@",
    "@@@  @@@@  @@@",
    " @@@@@@@@@@@@ ",
    "  @@@@@@@@@.  ",
    "    @@@@@@    ",
  ],
  [
    "      @@      ",
    "    @@@@@@    ",
    "  @@@@@@@@@@  ",
    " @@@@@@@@@@@@ ",
    "@@@@@@@@@@@@@@",
    "@@@@@  @  @@@@",
    "@@@@@  @  @@@@",
    " @@@@@@@@@@@@ ",
    "  @@@@@@@@@@  ",
    "   .@@@@@@    ",
  ],
];

export function useMouseTracker() {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const lastUpdateRef = useRef(0);

  const onMouseMove = useCallback((event: { x?: number; y?: number }) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < 30) return;
    lastUpdateRef.current = now;
    setCursor({ x: Number(event.x ?? 0), y: Number(event.y ?? 0) });
  }, []);

  return { cursor, onMouseMove };
}

export function TrackedRobot(props: { cursorX?: number; cursorY?: number; centerX: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 420);
    return () => clearInterval(timer);
  }, []);

  const cursorX = props.cursorX ?? props.centerX;
  const glance = cursorX < props.centerX - 8 ? 0 : cursorX > props.centerX + 8 ? 2 : 1;
  const frame = FRAMES[(tick + glance) % FRAMES.length] ?? FRAMES[1];

  return (
    <box flexDirection="column" alignItems="center" flexShrink={1} overflow="hidden">
      {frame.map((line, index) => (
        <text key={`${index}-${line}`} fg={palette.text} wrapMode="none">
          {line}
        </text>
      ))}
    </box>
  );
}
