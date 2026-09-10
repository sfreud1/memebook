import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/**
 * PGlite locally, node-postgres in production. Both speak the same dialect and
 * the same `$1` placeholders, so every query in this service is portable and
 * the only thing that changes between environments is DATABASE_URL.
 */
export async function openDb(): Promise<Db> {
  if (config.databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
    const db: Db = {
      query: async (sql, params = []) => (await pool.query(sql, params as any[])).rows,
      close: () => pool.end(),
    };
    await migrate(db);
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(config.pgliteDir);
  const db: Db = {
    query: async (sql, params = []) => (await pg.query(sql, params as any[])).rows as any[],
    close: () => pg.close(),
  };
  await migrate(db);
  return db;
}

async function migrate(db: Db) {
  const sql = readFileSync(resolve(here, "./schema.sql"), "utf8");
  // Statement-at-a-time: PGlite does not accept multi-statement strings.
  for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
}
