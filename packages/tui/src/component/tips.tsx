import { createMemo, For } from "solid-js";
import { useTheme } from "../context/theme";

type TipPart = { text: string; highlight: boolean };

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = [];
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g;
  const found = Array.from(tip.matchAll(regex));
  let index = 0;

  for (const match of found) {
    const start = match.index ?? 0;
    if (start > index) {
      parts.push({ text: tip.slice(index, start), highlight: false });
    }
    parts.push({ text: match[1], highlight: true });
    index = start + match[0].length;
  }

  if (index < tip.length) {
    parts.push({ text: tip.slice(index), highlight: false });
  }

  return parts;
}

const TIPS = [
  "Run {highlight}/create quick{/highlight} to start a low-risk markdown-first change",
  "Press {highlight}Ctrl+P{/highlight} to see all available actions and commands",
  "Press {highlight}Ctrl+B{/highlight} to show or hide the changes sidebar",
  "Run {highlight}/validate{/highlight} on a selected change to check planning gates",
  "Run {highlight}/prompt{/highlight} to load the first planning prompt for a change",
  "Run {highlight}/help{/highlight} for keyboard shortcuts and command reference",
  "Use {highlight}/home{/highlight} to return to the landing page from workspace view",
  "Run {highlight}/refresh{/highlight} to reload changes from the runtime",
];

export function Tips() {
  const { theme } = useTheme();
  const parts = createMemo(() => parse(TIPS[Math.floor(Math.random() * TIPS.length)]));

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Tip{" "}
      </text>
      <text flexShrink={1}>
        <For each={parts()}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  );
}
