import { Pool, types } from "pg";

// Tell pg to return DATE columns as raw 'YYYY-MM-DD' strings instead of
// converting them to JS Date objects (which shifts by local timezone offset
// and breaks our week-selector matching). 1082 is the OID for DATE.
types.setTypeParser(1082, (val: string) => val);

// Cache the pool across hot-reloads in dev (avoids "too many connections")
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const db: Pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = db;
}

export async function q<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await db.query(sql, params);
  return res.rows as T[];
}
