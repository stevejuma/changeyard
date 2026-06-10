import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import path from "path";
import { createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { createSimpleContext } from "./helper";

const filePath = path.join(homedir(), ".changeyard", "tui-kv.json");

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const [ready, setReady] = createSignal(false);
    const [store, setStore] = createStore<Record<string, unknown>>({});

    onMount(() => {
      try {
        if (existsSync(filePath)) {
          const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
          for (const [key, value] of Object.entries(parsed)) {
            setStore(key, value);
          }
        }
      } catch {
        // ignore corrupt kv file
      }
      setReady(true);
    });

    return {
      get ready() {
        return ready();
      },
      get(key: string, defaultValue?: unknown) {
        return store[key] ?? defaultValue;
      },
      set(key: string, value: unknown) {
        setStore(key, value);
        try {
          mkdirSync(path.dirname(filePath), { recursive: true });
          writeFileSync(filePath, JSON.stringify(store, null, 2));
        } catch {
          // ignore write failures
        }
      },
    };
  },
});
