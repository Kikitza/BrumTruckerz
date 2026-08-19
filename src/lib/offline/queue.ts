// src/lib/offline/queue.ts
//
// OFFLINE RED (srce vozačevog toka).
// Pravilo #6 iz CLAUDE.md: sve vozačeve mutacije idu OVUDA, nikad direktan
// poziv koji pada bez mreže. Red preživljava restart aplikacije (SQLite).
//
// Model: enqueue(kind, payload) upiše mutaciju lokalno i ODMAH vrati.
// flush() prazni red FIFO redom kad ima mreže; handler po `kind` zna kako
// da izvrši mutaciju na serveru.
//
// Otpornost (audit A4/B4):
//  * VEZANO ZA SESIJU: svaka stavka nosi user_id/company_id (ko ju je upisao);
//    flush šalje SAMO stavke AKTIVNE sesije (na deljenom uređaju se tuđe stavke
//    ne prelivaju u pogrešnu firmu).
//  * MAX_ATTEMPTS: posle N neuspeha stavka ide u dead-letter (lokalno) i red
//    NASTAVLJA — jedna trajno-loša mutacija ne blokira ceo red zauvek.
//    Dead-letter je vidljiv korisniku (broj + lista + „odustani od stavke").
//
// Perzistencija je iza QueueStore interfejsa (SQLite podrazumevano; testovi
// ubacuju in-memory store) — ekrani ne znaju za bazu, samo za API ispod.

export type MutationKind =
  | "trip_event.insert"
  | "trip_event.km"
  | "trip_event.correct"
  | "trip.progress"
  | "expense.insert"
  | "attachment.upload";

export type Handler = (payload: any) => Promise<void>;

export type PendingRow = {
  id: number; kind: MutationKind; payload: any; attempts: number;
  userId: string | null; companyId: string | null;
};
export type DeadRow = PendingRow & { lastError: string };

/** Perzistencija reda. SQLite podrazumevano; testovi ubacuju in-memory. */
export interface QueueStore {
  init(): Promise<void>;
  insert(r: { kind: MutationKind; payload: string; userId: string | null; companyId: string | null }): Promise<void>;
  next(userId: string): Promise<PendingRow | null>;          // najstarija pending stavka datog korisnika
  bump(id: number, lastError: string): Promise<void>;        // attempts++ + last_error
  remove(id: number): Promise<void>;
  toDead(id: number, lastError: string): Promise<void>;      // premesti pending -> dead
  pending(userId: string, kind?: MutationKind): Promise<PendingRow[]>;
  pendingCount(userId: string): Promise<number>;
  dead(userId: string): Promise<DeadRow[]>;
  removeDead(id: number): Promise<void>;
}

export const MAX_ATTEMPTS = 5; // posle ovoliko neuspeha -> dead-letter, red nastavlja

const handlers = new Map<MutationKind, Handler>();
export function registerHandler(kind: MutationKind, fn: Handler) {
  handlers.set(kind, fn);
}

// ── Sesija (ko upisuje/šalje): postavlja se iz root layout-a na promenu auth stanja ──
let sessionUserId: string | null = null;
let sessionCompanyId: string | null = null;

/** Poveži red sa aktivnom sesijom. Na promenu korisnika pokušaj flush novog. */
export function setQueueSession(userId: string | null, companyId: string | null) {
  sessionUserId = userId;
  sessionCompanyId = companyId;
  if (userId) void flush();
}

// ── Store (perzistencija) sa test-seam-om ──
let store: QueueStore | null = null;
function getStore(): QueueStore {
  if (!store) {
    // lazy require: expo-sqlite se NE učitava u test putanji (test ubaci svoj store)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSqliteQueueStore } = require("./sqliteQueueStore");
    store = createSqliteQueueStore();
  }
  return store as QueueStore;
}
/** Test-only: ubaci in-memory store. */
export function setQueueStore(s: QueueStore | null) {
  store = s;
}

// ── Mreža (injektabilno zbog testova) ──
let netIsConnected: () => Promise<boolean> = async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NetInfo = require("@react-native-community/netinfo").default;
  const net = await NetInfo.fetch();
  return !!net.isConnected;
};
/** Test-only: zameni proveru mreže. */
export function setNetProbe(fn: () => Promise<boolean>) {
  netIsConnected = fn;
}

/** Upiši mutaciju u lokalni red (vezano za aktivnu sesiju). Vraća odmah. */
export async function enqueue(kind: MutationKind, payload: unknown) {
  const s = getStore();
  await s.init();
  await s.insert({
    kind,
    payload: JSON.stringify(payload),
    userId: sessionUserId,
    companyId: sessionCompanyId,
  });
  void flush(); // pokušaj odmah (ako ima mreže) — fire and forget
}

let flushing = false; // single-flight

/**
 * Isprazni red FIFO redom za AKTIVNU sesiju.
 * Prolazna greška: attempts++ i stani (backoff, čuva redosled).
 * Posle MAX_ATTEMPTS: stavka -> dead-letter i NASTAVI (poison ne blokira red).
 */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    if (!(await netIsConnected())) return;
    const userId = sessionUserId;
    if (!userId) return; // bez utvrđene sesije ne šaljemo ništa

    const s = getStore();
    await s.init();
    for (;;) {
      const row = await s.next(userId);
      if (!row) return;

      const handler = handlers.get(row.kind);
      if (!handler) {
        // nepoznat kind (stara verzija app-a?) — ne diraj, stani
        console.warn(`[offline] nema handlera za ${row.kind}`);
        return;
      }
      try {
        await handler(row.payload);
        await s.remove(row.id);
      } catch (e) {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await s.toDead(row.id, String(e)); // poison -> dead-letter, red nastavlja
          continue;
        }
        await s.bump(row.id, String(e)); // prolazna greška: zabeleži i stani
        return;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Broj mutacija koje čekaju (aktivna sesija) — za UI bedž „čeka sinhronizaciju". */
export async function pendingCount(): Promise<number> {
  if (!sessionUserId) return 0;
  const s = getStore();
  await s.init();
  return s.pendingCount(sessionUserId);
}

/** Ukloni pending stavku po id-u (npr. vozač obriše pogrešnu pending sliku). */
export async function removePending(id: number): Promise<void> {
  const s = getStore();
  await s.init();
  await s.remove(id);
}

/** Read-only pregled reda za aktivnu sesiju (prikaz stavki koje čekaju). */
export async function listPending(kind?: MutationKind): Promise<PendingRow[]> {
  if (!sessionUserId) return [];
  const s = getStore();
  await s.init();
  return s.pending(sessionUserId, kind);
}

/** Stavke koje su trajno pale (dead-letter) — vidljive korisniku. */
export async function listDeadLetter(): Promise<DeadRow[]> {
  if (!sessionUserId) return [];
  const s = getStore();
  await s.init();
  return s.dead(sessionUserId);
}

/** Odustani od dead-letter stavke (korisnik svesno odbacuje neuspeli unos). */
export async function removeDeadLetter(id: number): Promise<void> {
  const s = getStore();
  await s.init();
  await s.removeDead(id);
}

/** Pozvati jednom iz root layout-a: sync na povratak mreže + periodični pokušaj. */
export function startSync() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NetInfo = require("@react-native-community/netinfo").default;
  NetInfo.addEventListener((state: { isConnected?: boolean | null }) => {
    if (state.isConnected) void flush();
  });
  setInterval(() => void flush(), 60_000); // sigurnosna mreža
}
