import { createSimpleContext } from "./helper";
import { RuntimeClient } from "../runtime-client";

export const { use: useRuntime, provider: RuntimeProvider } = createSimpleContext({
  name: "Runtime",
  init: (props: { client: RuntimeClient }) => ({
    client: props.client,
  }),
});
