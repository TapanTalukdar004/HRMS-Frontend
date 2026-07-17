import { cookies } from "next/headers";
import { verifyToken, SESSION_COOKIE, type Session } from "@/lib/jwt";

/**
 * Walking-skeleton shared-session landing (PRD 09 integration, Path B).
 * Standalone route OUTSIDE the (app) route group and OUTSIDE the legacy hrbot_user gate, so it proves the
 * one thing Phase 2 needs to prove: a user who logged in on Shlok's time-tracker lands here already
 * authenticated — NO second login. Reads the SHARED session token (Shlok's app sets it; we read it via
 * SESSION_COOKIE — swap in his TS session helper when provided), verifies it server-side, greets the user.
 * (In Phase 3, the whole (app) group's layout switches to this shared session and the legacy login retires.)
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Shared session · RUH HRMS" };

export default async function SessionPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let session: Session | null = null;
  let error: string | null = null;
  if (token) {
    try { session = await verifyToken(token); }
    catch (e) { error = (e as Error).message; }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7ff] via-white to-[#f3e8ff] px-4 py-16">
      <div className="max-w-2xl mx-auto rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[#AE00D0]">RUH HRMS · Shared session</div>
        {session ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">Hi, {session.email || session.sub} 👋</h1>
            <p className="text-[14px] text-slate-600 mt-2">
              You&apos;re signed in through the <b>shared session</b> as <b>{session.role}</b> — no second login.
            </p>
            <div className="mt-4 rounded-lg bg-stone-50 border border-stone-200 px-4 py-3 text-[12.5px] text-slate-600 space-y-0.5">
              <div><span className="text-slate-400">sub&nbsp;&nbsp;</span><code>{session.sub}</code></div>
              <div><span className="text-slate-400">role&nbsp;</span><code>{session.role}</code></div>
              <div><span className="text-slate-400">email</span> <code>{session.email || "—"}</code></div>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">No shared session yet</h1>
            <p className="text-[14px] text-slate-600 mt-2">
              {error
                ? <>A session token was present but didn&apos;t verify: <code className="text-rose-600">{error}</code>. Check <code>JWKS_URL</code>/<code>JWT_ISSUER</code>/<code>JWT_AUDIENCE</code>.</>
                : <>Log in on the time-tracker and open this under the shared domain — you&apos;ll arrive here already authenticated (cookie <code>{SESSION_COOKIE}</code>).</>}
            </p>
          </>
        )}
        <p className="mt-5 text-[11px] text-slate-400">Verified server-side against the time-tracker&apos;s JWKS (RS256). This app never mints tokens.</p>
      </div>
    </main>
  );
}
