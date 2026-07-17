import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/** Whatever `jwtVerify` accepts as its key arg in this jose version (key, JWK, secret, or JWKS resolver). */
type VerifyKey = Parameters<typeof jwtVerify>[1];

/**
 * Verify RUH HRMS (time-tracker) RS256 JWTs against Shlok's published JWKS — the identity provider.
 * PATH B: we ONLY verify tokens; we never mint them. There is NO shared secret and NO private key.
 *
 * Config is env-only (no secrets):
 *   JWKS_URL       — https://<timetracker-domain>/api/.well-known/jwks.json
 *   JWT_ISSUER     — expected `iss`  (default "timetracker-api")
 *   JWT_AUDIENCE   — expected `aud`  (default "timetracker-clients")
 *   SESSION_COOKIE — cookie the shared session stores the access token in (default "tt_access_token")
 *
 * `createRemoteJWKSet` caches the key set and auto-refreshes on an unknown `kid` with a cooldown, so a
 * blip in his API doesn't break my login. `jwtVerify` checks the RS256 signature + `iss` + `aud` + `exp`.
 */
export type Role = "employee" | "project_manager" | "hr";
export type Session = { sub: string; role: Role | string; email: string };

const JWT_ISSUER = process.env.JWT_ISSUER ?? "timetracker-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "timetracker-clients";
export const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "tt_access_token";

let _jwks: JWTVerifyGetKey | null = null;
function remoteJwks(): JWTVerifyGetKey {
  const url = process.env.JWKS_URL;
  if (!url) throw new Error("JWKS_URL is not set");
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(url)); // cached + auto-refreshing
  return _jwks;
}

/**
 * Verify a raw JWT and return the trusted claims, or throw. `keyOverride` (a public key or key-resolver)
 * is only for tests — production always uses the remote JWKS.
 */
export async function verifyToken(token: string, keyOverride?: VerifyKey): Promise<Session> {
  const key: VerifyKey = keyOverride ?? remoteJwks();
  const { payload } = await jwtVerify(token, key, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }); // signature + iss + aud + exp all enforced here
  const sub = String(payload.sub ?? "");
  const role = String((payload as { role?: unknown }).role ?? "");
  const email = String((payload as { email?: unknown }).email ?? "");
  if (!sub) throw new Error("token missing sub");
  if (!role) throw new Error("token missing role");
  return { sub, role, email };
}

/** Extract the token from a Request: `Authorization: Bearer …`, else the shared-session cookie. */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
