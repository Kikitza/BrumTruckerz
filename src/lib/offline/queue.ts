// src/lib/offline/queue.ts
//
// OFFLINE RED (srce vozačevog toka).
// Pravilo #6 iz CLAUDE.md: sve vozačeve mutacije idu OVUDA, nikad direktan
// poziv koji pada bez mreže. Red je u SQLite-u -> preživljava restart aplikacije.
//
// Model: enqueue(kind, payload) upiše mutaciju lokalno i ODMAH vrati.
// flush() prazni red FIFO redom kad ima mreže; handler po `kind` zna kako
// da izvrši mutaciju na serveru. Greška -> backoff + attempts, red staje
// (čuva redosled: događaj pre korekcije, trošak pre slike itd).

import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";

export type MutationKind =
  | "trip_event.insert"
  | "trip_event.correct"
  | "trip.progress"
  | "expense.insert"
  | "attachment.upload";

export type Handler = (payload: any) => Promise<void>;

const handlers = new Map<MutationKind, Handler>();
export function registerHandler(kind: MutationKind, fn: Handler) {
  handlers.set(kind, fn);
}

let db: SQLite.SQLiteDatabase | null = null;
async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("offline-queue.db");
    await db.execAsync(`
      create table if not exists mutations (
        id integer primary key autoincrement,
        kind text not null,
        payload text not null,
        attempts integer not null default 0,
        last_error text,
        created_at text not null default (datetime('now'))
      );
    `);
  }
  return db;
}

/** Upiši mutaciju u lokalni red. Vraća odmah — UI nikad ne čeka mrežu. */
export async function enqueue(kind: MutationKind, payload: unknown) {
  const d = await getDb();
  await d.runAsync(
    "insert into mutations (kind, payload) values (?, ?)",
    kind,
    JSON.stringify(payload),
  );
  // pokušaj odmah (ako ima mreže) — fire and forget
  void flush();
}

let flushing = false; // single-flight

/** Isprazni red FIFO redom. Staje na prvoj grešci (čuva redosled). */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    const d = await getDb();
    // uzimaj jedan po jedan da bi novi upisi tokom flusha ušli u red
    for (;;) {
      const row = await d.getFirstAsync<{
        id: number; kind: MutationKind; payload: string; attempts: number;
      }>("select id, kind, payload, attempts from mutations order by id limit 1");
      if (!row) return;

      const handler = handlers.get(row.kind);
      if (!handler) {
        // nepoznat kind (stara verzija app-a?) — ne briši, preskoči flush
        console.warn(`[offline] nema handlera za ${row.kind}`);
        return;
      }
      try {
        await handler(JSON.parse(row.payload));
        await d.runAsync("delete from mutations where id = ?", row.id);
      } catch (e) {
        // backoff: zabeleži pokušaj i stani; sledeći flush pokušava ponovo.
        await d.runAsync(
          "update mutations set attempts = attempts + 1, last_error = ? where id = ?",
          String(e), row.id,
        );
        return;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Broj mutacija koje čekaju (za UI bedž „čeka sinhronizaciju"). */
export async function pendingCount(): Promise<number> {
  const d = await getDb();
  const r = await d.getFirstAsync<{ n: number }>("select count(*) as n from mutations");
  return r?.n ?? 0;
}

/** Pozvati jednom iz root layout-a: sync na povratak mreže + periodični pokušaj. */
export function startSync() {
  NetInfo.addEventListener((state) => {
    if (state.isConnected) void flush();
  });
  setInterval(() => void flush(), 60_000); // sigurnosna mreža
}
