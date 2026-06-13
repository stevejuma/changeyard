import { createStore } from "solid-js/store";
import { createSimpleContext } from "./helper";
import type { ConfigTabId } from "../views/config-data";

export type RouteData =
  | { type: "home" }
  | { type: "workspace"; changeId?: string }
  | { type: "config"; tab?: ConfigTabId };

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<{ route: RouteData }>({
      route: { type: "home" },
    });

    return {
      get data() {
        return store.route;
      },
      home() {
        setStore("route", { type: "home" });
      },
      workspace(changeId?: string) {
        setStore("route", { type: "workspace", changeId });
      },
      config(tab?: ConfigTabId) {
        setStore("route", { type: "config", tab });
      },
    };
  },
});
