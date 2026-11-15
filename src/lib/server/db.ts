import path from "node:path";
import { MIGRATIONS } from "./migrations.generated";

export type Row = Record<string, any>;
export type Q = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  kind: "pg" | "pglite";
  query: Q;
  exec: (sql: string) => Promise<void>;
  tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T>;
}

const g = globalThis as unknown as { __pmuDriver?: Promise<Driver> };

async function makeDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 });
    pool.on("error", () => {});
    const query: Q = async (sql, params = []) => (await pool.query(sql, params as any[])).rows;
    const driver: Driver = {
      kind: "pg",
      query,
      exec: async (sql) => {
        await pool.query(sql);
      },
      tx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(async (s, p = []) => (await client.query(s, p as any[])).rows);
          await client.query("COMMIT");
          return result;
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
    };
    await migrate(driver, async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("SELECT pg_advisory_lock(730301)");
        await fn();
      } finally {
        await client.query("SELECT pg_advisory_unlock(730301)").catch(() => {});
        client.release();
      }
    });
    return driver;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.VERCEL ? "/tmp/pmu-pglite" : path.join(process.cwd(), ".data/pglite");
  const fs = await import("node:fs");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  const driver: Driver = {
    kind: "pglite",
    query: async (sql, params = []) => (await db.query(sql, params as any[])).rows as any,
    exec: async (sql) => {
      await db.exec(sql);
    },
    tx: (fn) =>
      db.transaction(async (t) => fn(async (s, p = []) => (await t.query(s, p as any[])).rows as any)) as any,
  };
  await migrate(driver, async (fn) => fn());
  return driver;
}

async function migrate(d: Driver, withLock: (fn: () => Promise<void>) => Promise<void>) {
  await withLock(async () => {
    await d.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set((await d.query<{ id: string }>("SELECT id FROM schema_migrations")).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await d.exec(m.sql);
      await d.query("INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING", [m.id]);
    }
  });
}

function driver(): Promise<Driver> {
  if (!g.__pmuDriver) {
    g.__pmuDriver = makeDriver().catch((e) => {
      g.__pmuDriver = undefined;
      throw e;
    });
  }
  return g.__pmuDriver;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await driver()).query<T>(sql, params);
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}

export async function dbKind() {
  return (await driver()).kind;
}

export const j = (v: unknown) => JSON.stringify(v ?? null);
export const uid = () => crypto.randomUUID();
