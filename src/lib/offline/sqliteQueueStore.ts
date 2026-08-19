// src/lib/offline/sqliteQueueStore.ts
//
// SQLite implementacija QueueStore-a (perzistentan red + dead-letter).
// Izdvojeno iz queue.ts da se expo-sqlite NE učitava u test putanji
// (testovi ubacuju in-memory store kroz setQueueStore()).

import * as SQLite from "expo-sqlite";
import type { QueueStore, PendingRow, DeadRow, MutationKind } from "./queue";

type Raw = {
  id: number; kind: string; payload: string; attempts: number;
  user_id: string | null; company_id: string | null;
};
type RawDead = Raw & { last_error: string };

function toPending(r: Raw): PendingRow {
  return {
    id: r.id, kind: r.kind as MutationKind, payload: JSON.parse(r.payload),
    attempts: r.attempts, userId: r.user_id, companyId: r.company_id,
  };
}

export function createSqliteQueueStore(): QueueStore {
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
          user_id text,
          company_id text,
          created_at text not null default (datetime('now'))
        );
        create table if not exists mutations_dead (
          id integer primary key,
          kind text not null,
          payload text not null,
          attempts integer not null default 0,
          last_error text,
          user_id text,
          company_id text,
          failed_at text not null default (datetime('now'))
        );
      `);
      // Evolucija starijih instalacija (kolone dodate naknadno; ignoriši ako postoje).
      for (const col of ["user_id text", "company_id text"]) {
        try { await db.execAsync(`alter table mutations add column ${col};`); } catch { /* već postoji */ }
      }
    }
    return db;
  }

  return {
    async init() { await getDb(); },

    async insert(r) {
      const d = await getDb();
      await d.runAsync(
        "insert into mutations (kind, payload, user_id, company_id) values (?, ?, ?, ?)",
        r.kind, r.payload, r.userId, r.companyId,
      );
    },

    async next(userId) {
      const d = await getDb();
      const row = await d.getFirstAsync<Raw>(
        "select id, kind, payload, attempts, user_id, company_id from mutations where user_id = ? order by id limit 1",
        userId,
      );
      return row ? toPending(row) : null;
    },

    async bump(id, lastError) {
      const d = await getDb();
      await d.runAsync(
        "update mutations set attempts = attempts + 1, last_error = ? where id = ?",
        lastError, id,
      );
    },

    async remove(id) {
      const d = await getDb();
      await d.runAsync("delete from mutations where id = ?", id);
    },

    async toDead(id, lastError) {
      const d = await getDb();
      await d.runAsync(
        `insert into mutations_dead (id, kind, payload, attempts, last_error, user_id, company_id)
         select id, kind, payload, attempts + 1, ?, user_id, company_id from mutations where id = ?`,
        lastError, id,
      );
      await d.runAsync("delete from mutations where id = ?", id);
    },

    async pending(userId, kind) {
      const d = await getDb();
      const sql = "select id, kind, payload, attempts, user_id, company_id from mutations where user_id = ?"
        + (kind ? " and kind = ?" : "") + " order by id";
      const rows = kind
        ? await d.getAllAsync<Raw>(sql, userId, kind)
        : await d.getAllAsync<Raw>(sql, userId);
      return rows.map(toPending);
    },

    async pendingCount(userId) {
      const d = await getDb();
      const r = await d.getFirstAsync<{ n: number }>(
        "select count(*) as n from mutations where user_id = ?", userId,
      );
      return r?.n ?? 0;
    },

    async dead(userId) {
      const d = await getDb();
      const rows = await d.getAllAsync<RawDead>(
        "select id, kind, payload, attempts, last_error, user_id, company_id from mutations_dead where user_id = ? order by id",
        userId,
      );
      return rows.map((r): DeadRow => ({ ...toPending(r), lastError: r.last_error }));
    },

    async removeDead(id) {
      const d = await getDb();
      await d.runAsync("delete from mutations_dead where id = ?", id);
    },
  };
}
