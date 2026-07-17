import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getPmDeskData, type UnmarkedIssue } from "@/lib/pmQueries";

/**
 * /pm — the PM DESK (changes/235): every ONGOING issue whose scoring inputs are missing (no story
 * points and/or no priority), grouped per employee, with the PR activity our nightly scheduler has
 * detected. Visible to the Project Manager (project_manager role — Shlok's JWT claim later, the tagged
 * `pm` account today) and HR/admin. The PM fixes the marking IN LINEAR (each row deep-links); this app
 * stays read-only. Data is live from the pipeline-fed tables — autonomous, never hardcoded or one-time.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "PM Desk · HR Bot" };

const dmy = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
const daysSince = (s: string | null) =>
  s ? Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400000)) : null;

const PALETTE = ["#AE00D0", "#7B5AFF", "#6745E8", "#378ADD", "#1D9E75", "#EF9F27", "#D4537E", "#0891B2"];
const colorFor = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

function statusChip(s: string | null) {
  const k = (s ?? "").trim().toLowerCase();
  const cls =
    k.includes("review") || k.includes("qa") ? "bg-sky-50 text-sky-700 ring-sky-200"
    : k.includes("development") || k.includes("progress") ? "bg-violet-50 text-violet-700 ring-violet-200"
    : k === "on hold" || k === "blocked" ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-stone-100 text-slate-500 ring-stone-200";
  return <span className={`inline-block text-[10.5px] ring-1 ring-inset rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>{s ?? "—"}</span>;
}

function Missing({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" /> {label}
    </span>
  );
}

function Kpi({ label, value, hint, c }: { label: string; value: React.ReactNode; hint: string; c: string }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 p-4">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="text-3xl font-bold tabular-nums mt-1.5 text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>
    </div>
  );
}

function PrActivity({ i }: { i: UnmarkedIssue }) {
  if (i.mergedPrs + i.openPrs === 0) return <span className="text-slate-300 text-[12px]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 px-2 py-0.5 font-medium">
        ⚡ {i.mergedPrs > 0 && `${i.mergedPrs} merged`}{i.mergedPrs > 0 && i.openPrs > 0 && " · "}{i.openPrs > 0 && `${i.openPrs} open`} PR{i.mergedPrs + i.openPrs > 1 ? "s" : ""}
      </span>
      <span className="text-slate-400">{dmy(i.lastPrAt)}</span>
    </span>
  );
}

export default async function PmDeskPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "employee") redirect("/me");   // PM / HR / admin only

  const data = await getPmDeskData();
  const team = session.team ?? "Agent Builder";        // every active team today; scopes per-PM later (JWT/directory)
  const { totals, groups, freshness, corrections, stale, prevCycle } = data;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-6">
      {/* Hero */}
      <div className="rounded-2xl p-6 sm:p-8 text-white bg-gradient-to-br from-[#6745E8] to-[#378ADD]">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">PM Desk</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px]">{team} team</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px]">
            {session.role === "project_manager" ? "Project Manager" : "HR / admin view"}
          </span>
        </div>
        <p className="mt-1.5 text-white/85 text-sm max-w-3xl">
          Ongoing issues from the <b>correctable window — the current + previous cycle</b> — whose <b>scoring inputs
          are missing</b> (no story points / no priority), grouped by owner, with the PR activity the nightly scan
          detected. Fix the marking in Linear (rows deep-link); this view is read-only. Mark <b>before</b> the PR
          merges and the score is right the first time; mark late and the system re-scores the issue&apos;s original
          cycle overnight — the previous cycle is the <b>last chance</b>, older is frozen for good.
        </p>
        <p className="mt-3 text-[12px] text-white/70">
          {freshness.lastRunAt
            ? <>Auto-refreshed by the nightly pipeline · last scan {new Date(freshness.lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} {freshness.ok ? "✓" : "· ⚠ last run had errors"}</>
            : "Fed by the nightly pipeline (no completed run recorded yet)."}
        </p>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Unmarked ongoing" value={totals.issues} hint="missing SP or priority" c="#AE00D0" />
        <Kpi label="No story points" value={totals.missingSp} hint="score with SP = 1" c="#e11d48" />
        <Kpi label="No priority" value={totals.missingPriority} hint="score at ×1.0" c="#EF9F27" />
        <Kpi label="Missing both" value={totals.missingBoth} hint="fully unweighted" c="#D4537E" />
        <Kpi label="Code already moving" value={totals.withPrActivity} hint="PRs detected — point first" c="#6745E8" />
        <Kpi label="People affected" value={totals.people} hint="owners with unmarked issues" c="#1D9E75" />
      </div>

      {/* Why it matters */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-[13px] text-slate-600">
        <b className="text-slate-800">Why this matters.</b> An issue&apos;s score weight = <b>story points × priority</b>.
        Unmarked issues score with SP&nbsp;=&nbsp;1 and priority&nbsp;×1.0 — so when the work ships, the engineer is
        <b> under-credited</b>. Issues where <b>code is already moving</b> (⚡) are the most urgent to point.
        <span className="text-slate-400"> Advisory — marking happens in Linear, never here.</span>
      </div>

      {/* Recent auto-corrections (changes/237): PM marked late → the nightly scorer re-scored the
          issue's ORIGINAL cycle. Proves the correction loop to the PM; hidden until one exists. */}
      {corrections.length > 0 && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-semibold text-emerald-900">Score corrections — applied automatically</h2>
            <span className="text-[11px] text-slate-400">marked late → re-scored into the cycle the work shipped in</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead className="text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="text-left py-1 pr-3">Issue</th><th className="text-left py-1 pr-3">Owner of points</th>
                  <th className="text-left py-1 pr-3">Cycle</th><th className="text-left py-1 pr-3">SP</th>
                  <th className="text-left py-1 pr-3">Priority</th><th className="text-left py-1 pr-3">Cycle score</th>
                  <th className="text-right py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((c, i) => (
                  <tr key={`${c.issueKey}-${i}`} className="border-t border-emerald-100/70">
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-emerald-800">{c.issueKey}</td>
                    <td className="py-1.5 pr-3 capitalize text-slate-700">{c.employee ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{c.cycleName ?? "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-700">{c.oldEstimate ?? "—"} → <b>{c.newEstimate ?? "—"}</b></td>
                    <td className="py-1.5 pr-3 capitalize text-slate-700">{c.oldPriority ?? "none"} → <b>{c.newPriority ?? "none"}</b></td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-700">{c.oldScore ?? "—"} → <b>{c.newScore ?? "—"}</b>/100</td>
                    <td className="py-1.5 text-right text-slate-400 whitespace-nowrap">{dmy(c.detectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Per-employee groups */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-14 text-center text-slate-400 text-sm">
          Nothing unmarked 🎉 — every ongoing issue has story points and a priority.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const color = colorFor(g.assignee);
            const isPerson = g.assignee !== "unassigned";
            return (
              <section key={g.assignee} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-stone-100">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: isPerson ? color : "#94a3b8" }}>
                    {g.assignee.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    {isPerson ? (
                      <Link href={`/employees/${encodeURIComponent(g.assignee)}`} className="font-semibold text-slate-900 capitalize hover:text-[#AE00D0]">{g.assignee}</Link>
                    ) : (
                      <span className="font-semibold text-slate-500">Unassigned</span>
                    )}
                    <div className="text-[11.5px] text-slate-400">
                      {g.issues.length} unmarked · {g.missingSp} without SP · {g.missingPriority} without priority
                      {g.withPrActivity > 0 && <span className="text-amber-700"> · ⚡ {g.withPrActivity} with PR activity</span>}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-[12.5px]">
                    <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="text-left px-4 py-2">Issue</th>
                        <th className="text-left px-3 py-2">Title</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-right px-3 py-2">Cycle</th>
                        <th className="text-left px-3 py-2">Missing</th>
                        <th className="text-left px-3 py-2">PR activity (auto-detected)</th>
                        <th className="text-right px-4 py-2">In cycle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.issues.map((i) => {
                        const d = daysSince(i.assignedAt);
                        return (
                          <tr key={i.issueKey} className="border-t border-stone-100 hover:bg-stone-50/60 align-top">
                            <td className="px-4 py-2.5 font-mono text-[11.5px] whitespace-nowrap">
                              {i.url
                                ? <a href={i.url} target="_blank" rel="noreferrer" className="text-[#6745E8] hover:underline" title="Open in Linear to set SP / priority">{i.issueKey} ↗</a>
                                : <span className="text-slate-600">{i.issueKey}</span>}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700 max-w-[300px]">
                              <div className="truncate" title={i.title ?? ""}>{i.title ?? "—"}</div>
                              {i.label && <span className="text-[10px] text-slate-400">{i.label}</span>}
                            </td>
                            <td className="px-3 py-2.5">{statusChip(i.status)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <span className="tabular-nums text-slate-500">{i.cycleNumber ?? "—"}</span>
                              {i.cycleNumber != null && i.cycleNumber === prevCycle && (
                                <span className="ml-1.5 inline-block text-[9.5px] uppercase tracking-wide rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-1.5 py-0.5">last chance</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex gap-1.5 flex-wrap">
                                {i.missingSp && <Missing label="No SP" />}
                                {i.missingPriority && <Missing label="No priority" />}
                                {!i.missingSp && <span className="text-[10.5px] text-slate-400 self-center">SP {i.estimate}</span>}
                                {!i.missingPriority && <span className="text-[10.5px] text-slate-400 self-center capitalize">{i.priority}</span>}
                              </span>
                            </td>
                            <td className="px-3 py-2.5"><PrActivity i={i} /></td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap text-slate-500 tabular-nums">
                              {dmy(i.assignedAt)}{d !== null && <span className="text-slate-300"> · {d}d</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Stale floaters (changes/238): work shipped long ago, status never closed. STATUS cleanup only —
          these are outside the correctable window, so they are never re-scored and never in the KPIs. */}
      {stale.length > 0 && (
        <details className="rounded-2xl border border-stone-300 bg-stone-50/60 overflow-hidden">
          <summary className="cursor-pointer select-none px-4 sm:px-5 py-3.5 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">Stale — status cleanup ({stale.length})</span>
            <span className="text-[11.5px] text-slate-400">PRs merged before the correctable window but the status still floats — mark these <b>complete/cancelled in Linear</b>. Never re-scored.</span>
          </summary>
          <div className="border-t border-stone-200 overflow-x-auto bg-white">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2">Issue</th>
                  <th className="text-left px-3 py-2">Owner</th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-left px-3 py-2">Floating status</th>
                  <th className="text-right px-3 py-2">Cycle</th>
                  <th className="text-left px-3 py-2">Last PR merged</th>
                  <th className="text-right px-4 py-2">In cycle</th>
                </tr>
              </thead>
              <tbody>
                {stale.map((s) => (
                  <tr key={s.issueKey} className="border-t border-stone-100 hover:bg-stone-50/60">
                    <td className="px-4 py-2 font-mono text-[11.5px] whitespace-nowrap">
                      {s.url
                        ? <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-600 hover:text-[#6745E8] hover:underline" title="Open in Linear to close the status">{s.issueKey} ↗</a>
                        : <span className="text-slate-600">{s.issueKey}</span>}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-600">{s.assignee}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[280px]"><div className="truncate" title={s.title ?? ""}>{s.title ?? "—"}</div></td>
                    <td className="px-3 py-2">{statusChip(s.status)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{s.cycleNumber ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                      {s.mergedPrs > 0 ? <>{s.mergedPrs} PR{s.mergedPrs > 1 ? "s" : ""} · {dmy(s.lastMergedAt)}</> : "—"}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap text-slate-400 tabular-nums">{dmy(s.inCycleAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        Live from the pipeline-fed tables (Linear sync · PR link detection) — refreshed by every nightly run, no manual upkeep.
      </p>
    </main>
  );
}
