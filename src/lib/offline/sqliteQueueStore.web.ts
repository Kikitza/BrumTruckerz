// WEB varijanta (F3): offline red je NATIVE-ONLY. Web je uvek online (ADR 0011), pa se ovaj store
// nikad ne instancira (startSync/registerAllHandlers su guard-ovani u app/_layout.tsx). Ova stub
// verzija postoji SAMO da uvoz `./sqliteQueueStore` na webu ne povuče `expo-sqlite` (wasm) u bundle.
import type { QueueStore } from "./queue";

export function createSqliteQueueStore(): QueueStore {
  return {
    async init() { /* no-op na webu */ },
    async insert() { /* web je online — enqueue se ne koristi */ },
    async next() { return null; },
    async bump() { /* no-op */ },
    async remove() { /* no-op */ },
    async toDead() { /* no-op */ },
    async pending() { return []; },
    async pendingCount() { return 0; },
    async dead() { return []; },
    async removeDead() { /* no-op */ },
  };
}
