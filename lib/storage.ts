/**
 * Supabase Storage helper — direct REST calls, no SDK.
 *
 * Why no @supabase/supabase-js?
 *   For just upload + delete + public-URL we use the Storage REST API
 *   directly via fetch.  That keeps the bundle smaller and avoids an
 *   extra runtime dep on Vercel.
 *
 * Env vars required (server-side only):
 *     SUPABASE_URL                 — e.g. https://srwjsxkdnezlrusjtpwa.supabase.co
 *     SUPABASE_SERVICE_ROLE_KEY    — service_role JWT from Supabase Dashboard
 *
 * If SUPABASE_URL is not set, it's auto-derived from the project ref in
 * DATABASE_URL (the postgres host contains the same ref).
 */

const STORAGE_BUCKET = "policies";

function projectRefFromDbUrl(): string | null {
  const url = process.env.DATABASE_URL || "";
  // Forms we accept:
  //   postgresql://postgres.<ref>:pwd@aws-1-xxx.pooler.supabase.com:6543/postgres
  //   postgresql://postgres:pwd@db.<ref>.supabase.co:5432/postgres
  const mPool = url.match(/postgres\.([a-z0-9]{20})/i);
  if (mPool) return mPool[1];
  const mDirect = url.match(/db\.([a-z0-9]{20})\.supabase\.co/i);
  if (mDirect) return mDirect[1];
  return null;
}

export function supabaseBaseUrl(): string {
  const explicit = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const ref = projectRefFromDbUrl();
  if (!ref) {
    throw new Error(
      "Could not determine Supabase URL. Set SUPABASE_URL env var (e.g. https://<ref>.supabase.co).",
    );
  }
  return `https://${ref}.supabase.co`;
}

function serviceRoleKey(): string {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!k) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY env var is not set. Grab it from " +
        "Supabase Dashboard → Settings → API → service_role (secret).",
    );
  }
  return k;
}

/** Object URL the browser hits to view/download the file. */
export function publicUrl(storagePath: string): string {
  return `${supabaseBaseUrl()}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURI(storagePath)}`;
}

/**
 * Upload bytes to Supabase Storage.  Returns the storage path on success.
 *
 * Throws on failure (caller should map to a 5xx).  Uses `x-upsert: true`
 * so a retry with the same path overwrites instead of erroring.
 */
export async function uploadObject(args: {
  path: string;         // path WITHIN the bucket (no leading slash)
  body: ArrayBuffer | Uint8Array | Blob;
  contentType?: string;
}): Promise<{ path: string; url: string }> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/${STORAGE_BUCKET}/${encodeURI(args.path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
      "Content-Type": args.contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: args.body as BodyInit,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed (${res.status}): ${txt.slice(0, 400)}`);
  }
  return { path: args.path, url: publicUrl(args.path) };
}

export async function deleteObject(storagePath: string): Promise<void> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/${STORAGE_BUCKET}/${encodeURI(storagePath)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
    },
  });
  // 404 is fine — object already gone — we still want the DB row cleared.
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase Storage delete failed (${res.status}): ${txt.slice(0, 400)}`);
  }
}

/** Slugify a filename component (used for the storage key suffix). */
export function safeFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const safeStem = stem
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  const safeExt = ext.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return safeExt ? `${safeStem}.${safeExt}` : safeStem;
}

/** Build the path used inside the bucket for a new upload. */
export function buildStoragePath(originalFilename: string): string {
  // crypto.randomUUID() is available in modern Node + Edge runtimes.
  const id = (globalThis.crypto as Crypto).randomUUID();
  return `${id}-${safeFilename(originalFilename)}`;
}
