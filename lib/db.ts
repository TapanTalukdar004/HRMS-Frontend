import { Pool, types } from "pg";

// Tell pg to return DATE columns as raw 'YYYY-MM-DD' strings instead of
// converting them to JS Date objects (which shifts by local timezone offset
// and breaks our week-selector matching). 1082 is the OID for DATE.
types.setTypeParser(1082, (val: string) => val);

// Cache the pool across hot-reloads in dev (avoids "too many connections")
const globalForPg = globalThis as unknown as { pgPool?: Pool };

function makePool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // CRITICAL: without an 'error' listener, an idle client that the
  // Supabase pooler drops server-side emits an 'error' event that
  // crashes the Node process (pg docs warn about exactly this).
  // We swallow it — the pool discards the dead client and opens a
  // fresh one on the next query.
  pool.on("error", (err) => {
    console.warn("[pg pool] idle client error (recovered):", err.message);
  });
  return pool;
}

export const db: Pool = globalForPg.pgPool ?? makePool();

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = db;
}

/** Connection-level errors that mean "the socket died, just retry on a
 *  fresh connection" — distinct from real SQL errors which should throw. */
function isTransientConnError(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return (
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("econnreset") ||
    msg.includes("server closed the connection") ||
    msg.includes("timeout exceeded")
  );
}

export async function q<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  // The Supabase Transaction Pooler aggressively recycles idle
  // connections.  A query that lands on a just-killed connection throws
  // "Connection terminated unexpectedly".  We retry ONCE on a fresh
  // connection — the second attempt almost always succeeds.
  try {
    const res = await db.query(sql, params);
    return res.rows as T[];
  } catch (err) {
    if (isTransientConnError(err)) {
      console.warn("[pg] transient connection error — retrying once");
      const res = await db.query(sql, params);
      return res.rows as T[];
    }
    throw err;
  }
}
