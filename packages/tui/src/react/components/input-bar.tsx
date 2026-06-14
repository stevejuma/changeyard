import type { InputRenderable } from "@opentui/core";
import { useRef } from "react";
import { palette } from "../palette";

export function InputBar(props: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const inputRef = useRef<InputRenderable | null>(null);
  return (
    <box flexDirection="row" alignItems="center" backgroundColor={palette.panel2} paddingX={2} paddingY={1}>
      <text fg={palette.accent}>
        <strong>{">"}</strong>
      </text>
      <box flexGrow={1} paddingLeft={1}>
        <input
          ref={(node) => {
            inputRef.current = node;
            node?.focus();
          }}
          focused
          value={props.value}
          placeholder={props.placeholder}
          onInput={props.onChange}
          onSubmit={(value) => props.onSubmit(typeof value === "string" ? value : inputRef.current?.value ?? props.value)}
        />
      </box>
    </box>
  );
}
