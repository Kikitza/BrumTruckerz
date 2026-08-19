// Testovi offline reda (audit B8): retry, poison -> dead-letter + red NASTAVLJA,
// vezivanje za sesiju (user-scoping). Perzistencija je in-memory store ubačen
// kroz setQueueStore() — expo-sqlite se ne dira (radi u CI bez native modula).

import {
  enqueue, flush, registerHandler, setQueueStore, setNetProbe, setQueueSession,
  listDeadLetter, MAX_ATTEMPTS, type QueueStore, type MutationKind,
} from "./queue";

// ── In-memory QueueStore (verno preslikava semantiku SQLite store-a) ──
type Row = { id: number; kind: MutationKind; payload: string; attempts: number; userId: string | null; companyId: string | null; lastError?: string };
function memStore() {
  let seq = 0;
  const pending: Row[] = [];
  const deadRows: Row[] = [];
  const parse = (r: Row) => ({ id: r.id, kind: r.kind, payload: JSON.parse(r.payload), attempts: r.attempts, userId: r.userId, companyId: r.companyId });
  const store: QueueStore = {
    async init() {},
    async insert(r) { pending.push({ id: ++seq, kind: r.kind, payload: r.payload, attempts: 0, userId: r.userId, companyId: r.companyId }); },
    async next(userId) {
      const r = pending.filter((x) => x.userId === userId).sort((a, b) => a.id - b.id)[0];
      return r ? parse(r) : null;
    },
    async bump(id, lastError) { const r = pending.find((x) => x.id === id); if (r) { r.attempts++; r.lastError = lastError; } },
    async remove(id) { const i = pending.findIndex((x) => x.id === id); if (i >= 0) pending.splice(i, 1); },
    async toDead(id, lastError) {
      const i = pending.findIndex((x) => x.id === id);
      if (i >= 0) { const r = pending.splice(i, 1)[0]; deadRows.push({ ...r, attempts: r.attempts + 1, lastError }); }
    },
    async pending(userId, kind) {
      return pending.filter((x) => x.userId === userId && (!kind || x.kind === kind)).sort((a, b) => a.id - b.id).map(parse);
    },
    async pendingCount(userId) { return pending.filter((x) => x.userId === userId).length; },
    async dead(userId) { return deadRows.filter((x) => x.userId === userId).map((r) => ({ ...parse(r), lastError: r.lastError ?? "" })); },
    async removeDead(id) { const i = deadRows.findIndex((x) => x.id === id); if (i >= 0) deadRows.splice(i, 1); },
  };
  return { store, _pending: pending, _dead: deadRows };
}

let connected = false;

beforeEach(() => {
  connected = false;
  setNetProbe(async () => connected);
  setQueueSession(null, null);
});

afterAll(() => { setQueueStore(null); });

test("prolazna greška: retry pa uspeh (bez dead-letter-a)", async () => {
  const m = memStore(); setQueueStore(m.store);
  let calls = 0;
  registerHandler("trip.progress", async () => { calls++; if (calls === 1) throw new Error("transient"); });

  setQueueSession("u1", "c1");
  await enqueue("trip.progress", { trip_id: "T" }); // net=false => bez flush-a

  connected = true;
  await flush(); // 1. pokušaj padne -> attempts=1, stane
  expect(m._pending.length).toBe(1);
  expect(m._pending[0].attempts).toBe(1);
  expect(m._dead.length).toBe(0);

  await flush(); // 2. pokušaj uspe -> stavka nestaje
  expect(m._pending.length).toBe(0);
  expect(m._dead.length).toBe(0);
  expect(calls).toBe(2);
});

test("poison stavka ide u dead-letter posle MAX_ATTEMPTS, a red NASTAVLJA", async () => {
  const m = memStore(); setQueueStore(m.store);
  let bOk = 0;
  registerHandler("expense.insert", async () => { throw new Error("permanent"); }); // uvek pada
  registerHandler("trip.progress", async () => { bOk++; }); // uspeva

  setQueueSession("u1", "c1");
  await enqueue("expense.insert", { id: "A" }); // poison (glava reda)
  await enqueue("trip.progress", { trip_id: "B" }); // iza njega

  connected = true;
  for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await flush();

  const dead = await listDeadLetter();
  expect(dead.length).toBe(1);
  expect(dead[0].kind).toBe("expense.insert");
  expect(m._pending.length).toBe(0); // B je obrađen posle premeštanja A u dead-letter
  expect(bOk).toBe(1);
});

test("flush šalje SAMO stavke aktivne sesije (user-scoping)", async () => {
  const m = memStore(); setQueueStore(m.store);
  const seen: string[] = [];
  registerHandler("trip.progress", async (p: { trip_id: string }) => { seen.push(p.trip_id); });

  setQueueSession("u1", "c1");
  await enqueue("trip.progress", { trip_id: "X" }); // vlasništvo u1
  setQueueSession("u2", "c2");
  await enqueue("trip.progress", { trip_id: "Y" }); // vlasništvo u2

  connected = true;
  await flush(); // aktivna sesija = u2 -> obradi samo Y

  expect(seen).toEqual(["Y"]);
  expect((await m.store.pending("u1")).length).toBe(1); // X ostaje (tuđa sesija)
  expect((await m.store.pending("u2")).length).toBe(0);
});
