"use client";
import { useState } from "react";
import Link from "next/link";
import type { CycleChanges, SnapshotDiff } from "@/lib/overviewQueries";

/**
 * "What changed" — day-over-day diff panel (changes/205, restyled 206 to match the team-cycle page).
 * A summary TILE row (Completed / Status flipped / New / Merged / Priority bumped / SP re-pointed /
 * Reassigned) + a score-movement line, then a collapsible detail with the Tickets & PRs tables, and a
 * "Notify HR / PM" action that copies a shareable summary (real send channel is a follow-up). The
 * event-log tiles are live immediately; the snapshot tiles (priority/SP/reassign + score deltas) light
 * up once 2 daily snapshots exist (seeded by the nightly run).
 */

const SINCE_PRESETS = [
  { key: "24h", label: "24h" }, { key: "3d", label: "3 days" },
  { key: "7d", label: "7 days" }, { key: "cycle", label: "This cycle" },
];

const fmtDT = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};
const fmtD = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

function Pill({ icon, label, count, accent }: { icon: string; label: string; count: number | null; accent: "emerald" | "amber" | "violet" | "blue" | "rose" }) {
  const zero = count === 0 || count == null;
  const cls = zero
    ? "bg-stone-50 border-stone-200 text-slate-400"
    : accent === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : accent === "amber" ? "bg-amber-50 border-amber-200 text-amber-800"
    : accent === "violet" ? "bg-violet-50 border-violet-200 text-violet-800"
    : accent === "blue" ? "bg-blue-50 border-blue-200 text-blue-800"
    : "bg-rose-50 border-rose-200 text-rose-800";
  return (
    <div className={`border rounded-xl px-3 py-2 ${cls}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-base leading-none" aria-hidden>{icon}</span>
        <span className="text-2xl font-bold tabular-nums leading-none">{count == null ? "—" : count}</span>
      </div>
      <div className={`text-[10px] uppercase tracking-wider mt-1 ${zero ? "text-slate-400" : "opacity-80"}`}>{label}</div>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, string> = {
    new: "bg-sky-100 text-sky-700", completed: "bg-emerald-100 text-emerald-700", status: "bg-amber-100 text-amber-700",
    merged: "bg-emerald-100 text-emerald-700", opened: "bg-amber-100 text-amber-700",
  };
  const label: Record<string, string> = { new: "new in cycle", completed: "completed", status: "status", merged: "merged", opened: "opened" };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${map[kind] ?? "bg-stone-100 text-slate-600"}`}>{label[kind] ?? kind}</span>;
}

export default function ChangesPanel({ changes, diff, since, cycleParam }: { changes: CycleChanges; diff: SnapshotDiff; since: string; cycleParam: number | null }) {
  const [copied, setCopied] = useState(false);
  const s = changes.summary;
  const hrefFor = (sinceKey: string) => {
    const p = new URLSearchParams();
    if (cycleParam != null) p.set("cycle", String(cycleParam));
    if (sinceKey !== "24h") p.set("since", sinceKey);
    const qs = p.toString();
    return `/overview${qs ? `?${qs}` : ""}`;
  };
  const sinceLabel = SINCE_PRESETS.find((p) => p.key === since)?.label ?? "24h";
  const topMovers = diff.deltas.slice(0, 4);

  const summaryText = [
    `Performance changes — cycle ${changes.cycle ?? "?"} (since ${sinceLabel})`,
    `Completed ${s.completed} · Status flipped ${s.statusFlipped} · New ${s.newTickets} · PRs merged ${s.prsMerged} · opened ${s.prsOpened}`,
    diff.hasPrior ? `Priority bumped ${diff.priorityBumped} · SP re-pointed ${diff.spRepointed} · Reassigned ${diff.reassigned}` : `(priority/SP/reassign + score deltas start after the next nightly snapshot)`,
    diff.hasPrior && diff.deltas.length ? `Score movers: ${diff.deltas.slice(0, 6).map((d) => `${d.employee} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const notify = async () => {
    try { await navigator.clipboard.writeText(summaryText); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked — no-op */ }
  };

  return (
    <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/40 via-white to-amber-50/30 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">What changed <span className="normal-case tracking-normal text-[11px] font-normal text-slate-400">· cycle {changes.cycle ?? "—"}</span></h2>
        <div className="flex items-center gap-2">
          {SINCE_PRESETS.map((p) => (
            <Link key={p.key} href={hrefFor(p.key)} className={`rounded-full px-2.5 py-1 text-[11px] transition ${p.key === since ? "bg-[#7B5AFF] text-white font-medium" : "bg-white/70 text-slate-600 hover:bg-white ring-1 ring-inset ring-stone-200"}`}>{p.label}</Link>
          ))}
          <span className="text-[11px] text-slate-500 ml-1">diff vs <b className="text-slate-700">{diff.hasPrior ? fmtD(diff.prevDate) : "baseline"}</b></span>
          <button onClick={notify} className="rounded-full bg-[#AE00D0] text-white px-3 py-1 text-[11px] font-medium hover:opacity-90 transition" title="Copy a shareable summary for HR / PM">
            {copied ? "✓ copied" : "🔔 Notify HR / PM"}
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Pill icon="✓" label="Completed"       count={s.completed}     accent="emerald" />
        <Pill icon="↻" label="Status flipped"  count={s.statusFlipped} accent="blue" />
        <Pill icon="+" label="New tickets"     count={s.newTickets}    accent="violet" />
        <Pill icon="⇢" label="PRs merged"      count={s.prsMerged}     accent="emerald" />
        <Pill icon="↑" label="Priority bumped" count={diff.hasPrior ? diff.priorityBumped : null} accent="amber" />
        <Pill icon="↑" label="SP re-pointed"   count={diff.hasPrior ? diff.spRepointed : null}    accent="violet" />
        <Pill icon="↻" label="Reassigned"      count={diff.hasPrior ? diff.reassigned : null}     accent="rose" />
      </div>

      {/* Score movement */}
      {diff.hasPrior ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-slate-500">Score movement:</span>
          <span className="text-emerald-700 font-medium">▲ {diff.scoreUp} up</span>
          <span className="text-rose-700 font-medium">▼ {diff.scoreDown} down</span>
          {topMovers.map((d) => (
            <span key={d.employee} className={`rounded-full px-2 py-0.5 text-[11px] ${d.delta > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              {d.employee} {d.delta > 0 ? "+" : ""}{d.delta}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 mt-3">Baseline snapshot set today — <b>priority / SP / reassign</b> counts and per-person <b>score deltas</b> light up after tonight&apos;s nightly run records a second snapshot.</p>
      )}
      <p className="text-[11px] text-slate-500 mt-1">Mid-cycle changes are normal — a flurry of priority bumps or status reversals near cycle end is worth a PM conversation. Open the detail to see exactly what moved.</p>

      {/* Collapsible detail */}
      <details className="mt-3 rounded-xl border border-stone-200 bg-white/80">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-[13px] font-medium text-slate-700">See what changed — {changes.tickets.length} ticket event{changes.tickets.length !== 1 ? "s" : ""} · {changes.prs.length} PR{changes.prs.length !== 1 ? "s" : ""}</summary>
        <div className="border-t border-stone-100 px-4 py-4 space-y-5">
          {/* Tickets */}
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Tickets <span className="text-slate-300 normal-case">· new + status changes · {changes.tickets.length}</span></h3>
            {changes.tickets.length === 0 ? <p className="text-[13px] text-slate-400 py-1">No ticket changes in this window.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-1.5 pr-3 font-medium">Ticket</th><th className="py-1.5 pr-3 font-medium">Title</th><th className="py-1.5 pr-3 font-medium">Who</th><th className="py-1.5 pr-3 font-medium">Change</th><th className="py-1.5 font-medium">When</th>
                </tr></thead>
                <tbody>{changes.tickets.map((t, i) => (
                  <tr key={`${t.issueKey}-${i}`} className="border-t border-stone-100 align-top">
                    <td className="py-1.5 pr-3 font-mono text-[12px] text-slate-700 whitespace-nowrap">{t.issueKey}</td>
                    <td className="py-1.5 pr-3 text-slate-700 max-w-[26rem] truncate">{t.title ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{t.assignee ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap"><KindBadge kind={t.kind} />{t.kind !== "new" && <span className="ml-2 text-[11px] text-slate-500">{t.fromStatus ?? "—"} → <b className="text-slate-700">{t.toStatus ?? "—"}</b></span>}</td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap text-[12px]">{fmtDT(t.at)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          {/* PRs */}
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Pull requests <span className="text-slate-300 normal-case">· opened + merged · {changes.prs.length}</span></h3>
            {changes.prs.length === 0 ? <p className="text-[13px] text-slate-400 py-1">No PR activity in this window.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-1.5 pr-3 font-medium">PR</th><th className="py-1.5 pr-3 font-medium">Title</th><th className="py-1.5 pr-3 font-medium">Author</th><th className="py-1.5 pr-3 font-medium">Event</th><th className="py-1.5 pr-3 font-medium">Linked</th><th className="py-1.5 font-medium">When</th>
                </tr></thead>
                <tbody>{changes.prs.map((p) => (
                  <tr key={p.prNumber} className="border-t border-stone-100 align-top">
                    <td className="py-1.5 pr-3 font-mono text-[12px] text-slate-700 whitespace-nowrap">#{p.prNumber}</td>
                    <td className="py-1.5 pr-3 text-slate-700 max-w-[22rem] truncate">{p.title ?? "—"}{p.kind === "merged" && !p.judged && <span className="ml-2 inline-block rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-medium">⚠ unjudged</span>}</td>
                    <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{p.author ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap"><KindBadge kind={p.kind} /></td>
                    <td className="py-1.5 pr-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">{p.linked.length ? p.linked.join(", ") : <span className="text-slate-300">untracked</span>}</td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap text-[12px]">{fmtDT(p.at)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
          <p className="text-[10px] text-slate-400">Tiles: Completed / Status / New / PRs from Linear <span className="font-mono">issue_status_history</span> + GitHub timestamps (live); Priority / SP / Reassigned + score deltas from <span className="font-mono">daily_*_snapshot</span> (day-over-day). Notify copies a summary to paste into Slack/email — auto-send is a follow-up.</p>
        </div>
      </details>
    </section>
  );
}
