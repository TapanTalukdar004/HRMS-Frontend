import Link from "next/link";
import type { EmployeeMasterRow } from "@/lib/queries";

/** NULL-base employee profile (PRD/08 Phase 1). Shown for a roster employee who has NO cycle data yet:
 *  a Horilla-style header + a "beautiful" performance summary card + a "Cycle — null" structure preview
 *  (the exact fields each cycle/issue will fill) + the score-formula explainer. Everything is a placeholder
 *  (— / pending) — no fabricated data. When the analyzer runs, these fields fill in place. Advisory only. */

const NAVY = "#12125c";
const PURPLE = "#AE00D0";

function tenure(joining: string | null): string {
  if (!joining) return "—";
  const d = new Date(joining + "T00:00:00Z");
  if (isNaN(d.getTime())) return "—";
  const months = Math.max(0, Math.round((Date.now() - d.getTime()) / (30 * 864e5)));
  const label = months < 12 ? `${months} mo` : `${(months / 12).toFixed(1)} yr`;
  return `joined ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${label}`;
}

const Ghost = () => <span className="text-slate-300">—</span>;

/** One placeholder sub-factor tile. */
function Factor({ label, source, hint }: { label: string; source: "Linear" | "GitHub"; hint: string }) {
  const src = source === "Linear" ? "bg-emerald-50 text-emerald-700" : "bg-[#fdf0ff] text-[#AE00D0]";
  return (
    <div className="rounded-lg bg-stone-50 border border-stone-200 p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`text-[9px] uppercase tracking-wide rounded px-1 py-0.5 ${src}`}>{source}</span>
      </div>
      <div className="text-2xl font-bold text-slate-300 tabular-nums mt-1">—</div>
      <div className="text-[10px] text-slate-400">{hint}</div>
    </div>
  );
}

const ISSUE_COLS = ["Issue", "Title", "Type", "Priority", "Story pts", "Weight", "Status / credit", "Bug ×", "Points"];

export default function NullBaseProfile({ emp }: { emp: EmployeeMasterRow }) {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/employees" className="text-[13px] text-[#AE00D0] hover:underline">← All employees</Link>
        <Link href={`/employees/new?id=${emp.employee_id}`} className="text-[13px] text-slate-500 hover:text-[#AE00D0] hover:underline">edit employee</Link>
      </div>

      {/* Header strip */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-5 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight" style={{ color: NAVY }}>{emp.name}</h1>
            <div className="text-[13px] text-slate-600 mt-1">
              {emp.designation || <Ghost />}{emp.department ? ` · ${emp.department}` : ""}
            </div>
            <div className="text-[12px] text-slate-400 mt-0.5">{tenure(emp.joining_date)}{emp.location ? ` · ${emp.location}` : ""}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-stone-100 text-slate-500 ring-1 ring-inset ring-stone-300 px-2 py-0.5">status —</span>
              <span className="text-slate-500"><span className="text-slate-400">gh</span> {emp.github_login || <span className="text-slate-300">not set</span>}</span>
              <span className="text-slate-500"><span className="text-slate-400">ln</span> {emp.linear_email || <span className="text-slate-300">not set</span>}</span>
            </div>
          </div>
          <div className="text-center shrink-0">
            <div className="w-[86px] h-[86px] rounded-full border-4 border-stone-200 flex items-center justify-center">
              <span className="text-3xl font-bold text-slate-300 tabular-nums">—</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1.5">monthly score</div>
            <span className="inline-block mt-1 text-[10px] rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-2 py-0.5">pending analyzer</span>
          </div>
        </div>
      </div>

      {/* Beautiful performance card (the at-a-glance HR view) */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-800">Performance</h2>
          <span className="text-[11px] text-slate-400">— vs last month · — vs team avg</span>
        </div>
        <p className="text-[12.5px] text-slate-500 mb-4">No scored work yet — once the GitHub + Linear analyzer is connected, this shows how much important work {emp.name.split(" ")[0]} completed, how well, and on time.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Factor label="Output" source="Linear" hint="difficulty-weighted work done" />
          <Factor label="Quality" source="GitHub" hint="code review + rework" />
          <Factor label="Timeliness" source="Linear" hint="completed on target (+bonus)" />
          <Factor label="Impact" source="GitHub" hint="code-graph blast radius" />
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[["Completed", "issues shipped"], ["Story points", "delivered"], ["Cycles", "tracked"], ["Link coverage", "PRs ↔ issues"]].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-stone-50 p-2.5">
              <div className="text-xl font-bold text-slate-300 tabular-nums">—</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
              <div className="text-[10px] text-slate-400">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-slate-400">Advisory — this informs a human decision; scores are never applied automatically.</div>
      </section>

      {/* Cycle — null: the structure preview */}
      <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <details open>
          <summary className="cursor-pointer list-none px-5 py-3.5 hover:bg-stone-50/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">▾</span>
              <div>
                <div className="font-medium text-slate-900">Cycle — <span className="text-slate-400">null</span></div>
                <div className="text-[11px] text-slate-500">no cycle connected yet · structure preview</div>
              </div>
            </div>
            <span className="text-2xl font-bold text-slate-300 tabular-nums">—<span className="text-sm font-normal text-slate-300">/10</span></span>
          </summary>

          {/* per-cycle sub-metrics band (placeholder) */}
          <div className="border-t border-stone-100 bg-stone-50/40 px-5 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[["Throughput", "weighted work done"], ["Timeliness", "completed on target"], ["Volume", "issues completed"], ["Lanes", "schedule fit"]].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
                  <div className="text-lg font-bold text-slate-300 tabular-nums">—</div>
                  <div className="text-[10px] text-slate-400">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* per-issue field structure (the fields each issue will fill) */}
          <div className="border-t border-stone-100 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-stone-50/60 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>{ISSUE_COLS.map((c) => (<th key={c} className={`px-3 py-2 ${c === "Title" ? "text-left" : c === "Issue" || c === "Type" || c === "Priority" || c === "Status / credit" ? "text-left" : "text-right"}`}>{c}</th>))}</tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((i) => (
                  <tr key={i} className="border-t border-stone-100">
                    {ISSUE_COLS.map((c) => (<td key={c} className={`px-3 py-2.5 text-slate-300 ${c === "Title" ? "text-left" : c === "Issue" || c === "Type" || c === "Priority" || c === "Status / credit" ? "text-left" : "text-right"}`}>—</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-4 text-center text-[12px] text-slate-400 border-t border-stone-100">
              No issues yet. When GitHub + Linear are connected, each issue {emp.name.split(" ")[0]} works on appears here — with its story points, priority, status, and (once the PR is found) code quality and impact.
            </div>
          </div>
        </details>
      </section>

      {/* How the score will be calculated (explainer) */}
      <section className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <details>
          <summary className="cursor-pointer list-none px-5 py-3 text-[13px] text-slate-700 hover:bg-stone-50/60 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#fdf0ff] text-[#AE00D0] text-[10px] font-bold">?</span>
            How the score will be calculated (once connected)
          </summary>
          <div className="px-5 pb-5 pt-1 text-[12.5px] text-slate-600 leading-relaxed space-y-2">
            <p><b>Per issue</b> — value = effort × priority × completion × correction. Effort = 1 + log(1 + story points) so a huge ticket can&apos;t dominate; priority = P0 2.0 / P1 1.5 / P2 1.0 / Low 0.7; completion grows with status (a feature with an open bug is capped); a bug you <i>caused</i> docks it, a bug you were <i>assigned to fix</i> does not.</p>
            <p><b>Per cycle</b> — four parts shown side by side: <b>Output</b> (sum of issue value), <b>Quality</b> (code review + rework), <b>Timeliness</b> (bonus only — lateness never subtracts), <b>Impact</b> (code-graph blast radius, a small multiplier). Normalised 0–100 against a rolling baseline.</p>
            <p><b>Monthly</b> — the weighted average of the person&apos;s cycles (a cycle counts to the month it ends in).</p>
            <p className="text-slate-400">Output + Timeliness come from Linear (available now); Quality + Impact + merged-PR proof come from GitHub (pending). Every number is shown decomposed, with context — never a bare rank, never auto-applied.</p>
          </div>
        </details>
      </section>
    </main>
  );
}
