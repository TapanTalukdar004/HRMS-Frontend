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

/** Connection-level errors that mean "the socket/DNS hiccuped, just retry on a
 *  fresh connection" — distinct from real SQL errors which should throw.
 *  Includes DNS failures (ENOTFOUND / EAI_AGAIN / getaddrinfo) because the
 *  Supabase pooler hostname can briefly fail to resolve on flaky networks. */
function isTransientConnError(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | undefined;
  const msg = (e?.message ?? "").toLowerCase();
  const code = (e?.code ?? "").toUpperCase();
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"].includes(code)) {
    return true;
  }
  return (
    msg.includes("connection terminated") ||
    msg.includes("connection reset") ||
    msg.includes("econnreset") ||
    msg.includes("server closed the connection") ||
    msg.includes("timeout exceeded") ||
    msg.includes("getaddrinfo") ||      // DNS blip
    msg.includes("enotfound") ||
    msg.includes("eai_again") ||
    msg.includes("econnrefused")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function q<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  // The Supabase Transaction Pooler aggressively recycles idle connections,
  // and the pooler hostname can briefly fail DNS on flaky networks.  Retry a
  // few times with a short backoff so a sub-second blip never surfaces as a
  // runtime error — only a genuinely-down DB (or a real SQL error) throws.
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [150, 400];   // delays before attempt 2 and 3
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await db.query(sql, params);
      return res.rows as T[];
    } catch (err) {
      lastErr = err;
      if (!isTransientConnError(err) || attempt === MAX_ATTEMPTS) throw err;
      console.warn(`[pg] transient connection error (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying`);
      await sleep(BACKOFF_MS[attempt - 1] ?? 400);
    }
  }
  throw lastErr;   // unreachable, satisfies the type checker
}
