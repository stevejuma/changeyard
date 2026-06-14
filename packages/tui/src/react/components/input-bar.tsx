import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useCallback, useRef } from "react";

export type TextareaHandle = Pick<
  TextareaRenderable,
  "plainText" | "onSubmit" | "focus" | "setText" | "insertText" | "cursorOffset" | "visualCursor" | "height" | "virtualLineCount" | "extmarks" | "getSelection"
>;

export function InputBar(props: {
  accent: string;
  inputBackground: string;
  inputForeground: string;
  inputPlaceholder: string;
  placeholder: string;
  initialValue: string;
  inputKey: number;
  onContentChange: (value: string) => void;
  onSubmit: () => void;
  onVisualCursorChange?: (cursor: { visualCol: number; visualRow: number }) => void;
  onFocusRequest?: () => void;
  textareaRef?: React.MutableRefObject<TextareaHandle | null>;
}) {
  const localRef = useRef<TextareaHandle | null>(null);
  const inputRef = props.textareaRef ?? localRef;
  const onSubmitRef = useRef(props.onSubmit);
  onSubmitRef.current = props.onSubmit;
  const onContentChangeRef = useRef(props.onContentChange);
  onContentChangeRef.current = props.onContentChange;
  const onVisualCursorChangeRef = useRef(props.onVisualCursorChange);
  onVisualCursorChangeRef.current = props.onVisualCursorChange;

  const emitVisualCursorChange = useCallback(() => {
    const cursor = inputRef.current?.visualCursor;
    if (!cursor) return;
    onVisualCursorChangeRef.current?.({
      visualCol: cursor.visualCol,
      visualRow: cursor.visualRow,
    });
  }, [inputRef]);

  const textareaRefCallback = useCallback(
    (node: unknown) => {
      const textarea = node as TextareaHandle | null;
      inputRef.current = textarea;
      if (textarea) {
        textarea.onSubmit = () => onSubmitRef.current();
        textarea.focus();
        emitVisualCursorChange();
      }
    },
    [emitVisualCursorChange, inputRef],
  );

  return (
    <box
      flexDirection="row"
      alignItems="flex-start"
      backgroundColor={props.inputBackground}
      paddingX={2}
      paddingY={1}
      onMouseDown={props.onFocusRequest}
    >
      <text fg={props.accent}>
        <strong>{">"}</strong>
      </text>
      <box flexGrow={1} paddingLeft={1}>
        <textarea
          key={props.inputKey}
          ref={textareaRefCallback as React.RefCallback<never>}
          initialValue={props.initialValue}
          onContentChange={() => {
            queueMicrotask(() => {
              onContentChangeRef.current(inputRef.current?.plainText ?? "");
              emitVisualCursorChange();
            });
          }}
          onKeyDown={(_event: KeyEvent) => {
            queueMicrotask(() => emitVisualCursorChange());
          }}
          placeholder={props.placeholder}
          placeholderColor={props.inputPlaceholder}
          textColor={props.inputForeground}
          focusedTextColor={props.inputForeground}
          focused
          flexGrow={1}
          cursorColor={props.accent}
          minHeight={1}
          maxHeight={5}
          wrapMode="word"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "return", shift: true, action: "newline" },
            { name: "return", ctrl: true, action: "newline" },
            { name: "return", meta: true, action: "newline" },
          ]}
        />
      </box>
    </box>
  );
}
