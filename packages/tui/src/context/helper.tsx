import { createContext, Show, useContext, type ParentProps } from "solid-js";

export function createSimpleContext<T, Props extends Record<string, unknown>>(input: {
  name: string;
  init: ((props: Props) => T) | (() => T);
}) {
  const ctx = createContext<T>();

  return {
    provider: (props: ParentProps<Props>) => {
      const value = input.init(props as Props);
      return (
        <Show when={(value as { ready?: boolean }).ready === undefined || (value as { ready?: boolean }).ready === true}>
          <ctx.Provider value={value}>{props.children}</ctx.Provider>
        </Show>
      );
    },
    use() {
      const value = useContext(ctx);
      if (!value) throw new Error(`${input.name} context must be used within a context provider`);
      return value;
    },
  };
}
