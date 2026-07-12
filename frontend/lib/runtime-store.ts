import { createStore } from "./store";

const globalForStore = globalThis as typeof globalThis & {
  __wimtStore?: ReturnType<typeof createStore>;
};

export function getStore() {
  if (!globalForStore.__wimtStore) {
    globalForStore.__wimtStore = createStore();
  }

  return globalForStore.__wimtStore;
}
