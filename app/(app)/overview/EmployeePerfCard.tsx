import Link from "next/link";
import type { RosterEmployeeRow } from "@/lib/queries";
import type { PerfCardData } from "@/lib/overviewQueries";
import LazyIssueTable from "./LazyIssueTable";

/** Full-width per-employee ROW for the performance overview — ISSUE-SPINE model (changes/173).
 *  One coherent set of numbers: Assigned = proven + awaiting (always reconciles); helped is shown
 *  separately; Evidence PRs is a DISTINCT count. The collapsible lists EVERY in-scope issue (no
 *  truncation) with a proven/awaiting/helped state chip and its timeline dates. Grey means
 *  "no proof visible in this repo yet", never a penalty. */

const PALETTE = ["#AE00D0", "#7B5AFF", "#6745E8", "#378ADD", "#1D9E75", "#EF9F27", "#D4537E", "#0891B2"];
function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return (((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase()) || "?";
}
const f1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : (Math.round(v * 10) / 10).toFixed(1));
const pct = (v: number) => `${Math.round(v * 100)}%`;

const BAND: Record<string, { word: string; cls: string }> = {
  strong: { word: "Strong", cls: "bg-emerald-100 text-emerald-700" },
  ok: { word: "OK", cls: "bg-amber-100 text-amber-700" },
  weak: { word: "Needs review", cls: "bg-rose-100 text-rose-700" },
  none: { word: "No proof", cls: "bg-stone-100 text-slate-400" },
};

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="px-5 first:pl-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5" style={{ color: tone ?? "#cbd5e1" }}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function Chip({ label, n, bad }: { label: string; n: number | string; bad: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset px-2.5 py-1 text-[11px] ${bad ? "ring-rose-200 bg-rose-50 text-rose-700" : "ring-stone-200 bg-stone-50 text-slate-400"}`}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${bad ? "bg-rose-400" : "bg-slate-300"}`} /> {label} <b>{n}</b>
    </span>
  );
}

export default function EmployeePerfCard({ emp, data }: { emp: RosterEmployeeRow; data?: PerfCardData }) {
  const color = colorFor(emp.employee_name);
  const href = `/employees/${encodeURIComponent(emp.employee_name)}`;
  const first = emp.employee_name.split(" ")[0];
  const d = data;
  const band = BAND[d?.band ?? "none"];
  const hasProof = !!d && d.evidencePrs > 0;
  const ownPct = d && d.totalM ? (d.own / d.totalM) * 100 : 0;
  const otherPct = d && d.totalM ? (d.other / d.totalM) * 100 : 0;
  const untrkPct = d && d.totalM ? (d.untracked / d.totalM) * 100 : 0;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden transition hover:shadow-md hover:border-stone-300">
      <div className="flex items-stretch">
        <div className="w-1.5 shrink-0" style={{ background: color }} />
        <div className="flex-1 min-w-0 p-5 sm:p-6">
          {/* Header: identity + band · headline persisted score */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0" style={{ background: color }}>{initials(emp.employee_name)}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={href} className="text-xl font-semibold text-slate-900 hover:text-[#AE00D0] leading-none">{emp.employee_name}</Link>
                  <span className={`text-[10px] uppercase tracking-wider rounded px-2 py-0.5 ${band.cls}`}>{band.word}</span>
                  {d && d.flags.security > 0 && <span className="text-[10px] uppercase tracking-wider rounded bg-rose-100 text-rose-700 px-2 py-0.5">⚠ security review</span>}
                </div>
                <p className="text-[13px] text-slate-500 mt-1.5">
                  {hasProof ? d!.verdict
                    : d && d.assigned > 0 ? `${d.assigned} assigned issue${d.assigned > 1 ? "s" : ""} in scope — no merged PR found in this repo yet (may ship elsewhere).`
                    : `No analyzed work for ${first} in this scope.`}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-3xl font-bold tabular-nums leading-none ${hasProof ? "text-slate-900" : "text-slate-300"}`}>{d?.combined != null ? Math.round(d.combined) : "—"}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">performance score · /100</div>
            </div>
          </div>

          {/* The ISSUE SPINE — assigned = proven + awaiting; helped separate; distinct PR count */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-stone-200 border-t border-b border-stone-100 py-3.5">
            <Stat label="Assigned" value={d ? String(d.assigned) : "—"}
                  sub={d ? `${d.proven} proven + ${d.awaiting} awaiting proof` : "issues in scope"}
                  tone={d ? "#334155" : undefined} />
            <Stat label="Evidence PRs" value={d ? String(d.evidencePrs) : "—"}
                  sub={d ? `distinct merged linked · ${f1(d.points)} pts earned · ${f1(d.avgQuality)}/10` : "merged + linked"}
                  tone={hasProof ? "#7B5AFF" : undefined} />
            <Stat label="On-plan" value={d && d.totalM ? pct(d.onPct) : "—"}
                  sub={d && d.helped > 0 ? `+ helped on ${d.helped} others' tickets` : "of shipped PRs on own tickets"}
                  tone={d && d.totalM ? (d.onPct >= 0.5 ? "#1D9E75" : "#EF9F27") : undefined} />
          </div>

          {/* In-scope evidence mix (own / helped / untracked — all inside the selected scope) */}
          <div className="mt-3.5">
            <div className="h-2 rounded-full bg-stone-200 overflow-hidden flex">
              <div className="bg-emerald-400" style={{ width: `${ownPct}%` }} />
              <div className="bg-sky-400" style={{ width: `${otherPct}%` }} />
              <div className="bg-slate-400" style={{ width: `${untrkPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> {d ? d.own : "—"} on own tickets</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" /> {d ? d.other : "—"} helping others</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" /> {d ? d.untracked : "—"} untracked (no ticket id)</span>
              <span className="text-slate-300">· in-scope PRs only</span>
            </div>
          </div>

          {/* Score make-up — the three parts of the independent /100 (PRD 10): Delivery · Quality · Reach */}
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium" style={{ background: "#7B5AFF14", color: "#6745E8" }}>Output <b className={d?.output != null ? "" : "text-slate-300"}>{d?.output != null ? pct(d.output) : "—"}</b></span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium" style={{ background: "#1D9E7512", color: "#1D9E75" }}>Quality <b className={d?.avgQuality != null ? "" : "text-slate-300"}>{f1(d?.avgQuality)}/10</b></span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium" style={{ background: "#378ADD12", color: "#378ADD" }}>Reach <b className={d?.reach != null ? "" : "text-slate-300"}>{d?.reach != null ? pct(d.reach) : "—"}</b></span>
            <span className="text-[11px] text-slate-400 self-center">= {d?.combined != null ? Math.round(d.combined) : "—"}/100 · independent</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="Title ≠ work" n={d ? d.flags.mismatch : "—"} bad={!!d && d.flags.mismatch > 0} />
            <Chip label="Claim without proof" n={d ? d.flags.noProof : "—"} bad={!!d && d.flags.noProof > 0} />
            <Chip label="Partial delivery" n={d ? d.flags.scope : "—"} bad={!!d && d.flags.scope > 0} />
            <Chip label="No story points" n={d ? d.flags.unpointed : "—"} bad={false} />
          </div>

          <p className="mt-3.5 text-[11px] text-slate-400">Advisory · proof-first — an issue counts as proven only when a merged PR links to it. &ldquo;Awaiting proof&rdquo; is neutral (work may be unlinked or in another repo); only an advanced-status issue with no code is flagged red.</p>
        </div>
      </div>

      {/* Collapsible — EVERY in-scope issue, with state + timeline dates (no truncation).
          LAZY (changes/236): rows mount client-side on first expand — see LazyIssueTable. */}
      <LazyIssueTable
        name={emp.employee_name} color={color} href={href} hasProof={hasProof}
        summary={d ? { assigned: d.assigned, proven: d.proven, awaiting: d.awaiting, helped: d.helped, evidencePrs: d.evidencePrs, avgQuality: d.avgQuality, points: d.points } : null}
        issues={d?.issues ?? []}
      />
    </div>
  );
}
