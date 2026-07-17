/**
 * DeviationCard — HR/PM "Assigned vs Shipped" summary for one engineer.
 * Read-only, deterministic. Shows what they were assigned, what they shipped,
 * and where the two diverge, with a plain verdict + colour-tiered action chips.
 * RED = correct/verify now · AMBER = ask in a 1:1 · GREY = fix the system, not the person.
 */
import type { EmployeeReport } from "@/lib/realReport";
import { f1, bandWord } from "./EngineerReport";

type Tone = "red" | "amber" | "grey";
const TONE: Record<Tone, string> = {
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  grey: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Chip({ tone, label, detail }: { tone: Tone; label: string; detail?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ${TONE[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone === "red" ? "bg-rose-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400"}`} />
      {label}{detail && <span className="font-normal opacity-80">· {detail}</span>}
    </span>
  );
}

const prList = (ns: number[], max = 5) => ns.slice(0, max).map((n) => `#${n}`).join(", ") + (ns.length > max ? ` +${ns.length - max}` : "");
const keyList = (ks: string[], max = 4) => ks.slice(0, max).join(", ") + (ks.length > max ? ` +${ks.length - max}` : "");

/** `employeeView` = the person's OWN page: hides the HR/PM attention flags + the honesty footnote
 *  (the "needs a look" signals are a manager's diagnostic, not something to show the individual).
 *  Default (HR/PM) keeps everything. */
export function DeviationCard({ r, employeeView = false }: { r: EmployeeReport; employeeView?: boolean }) {
  const d = r.deviation;
  const { own, other, untracked, total } = d.onTicket;
  const pct = Math.round(d.onTicket.pct * 100);
  const seg = (n: number) => (total ? `${(100 * n) / total}%` : "0%");
  // dominant tone drives the left accent stripe
  const tone: Tone = d.securityPrs.length || d.mismatchPrs.length || d.noProof ? "red" : (d.offTicket || d.scopePrs.length) ? "amber" : "grey";
  const accent = tone === "red" ? "border-l-rose-400" : tone === "amber" ? "border-l-amber-400" : "border-l-slate-300";

  return (
    <div className={`rounded-xl border border-stone-200 border-l-4 ${accent} bg-white overflow-hidden`}>
      {/* Header: name + on-ticket gauge + verdict */}
      <div className="flex items-start gap-4 px-4 pt-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-900 capitalize">{r.employee}</span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400">{bandWord(r.band)}</span>
          </div>
          <p className="mt-0.5 text-[14px] text-slate-700 leading-snug">{d.verdict}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-2xl font-bold tabular-nums leading-none ${pct >= 50 ? "text-emerald-600" : pct >= 25 ? "text-amber-600" : "text-rose-600"}`}>
            {total ? `${pct}%` : "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">on own tickets</div>
        </div>
      </div>

      {/* 3-segment on-ticket bar */}
      <div className="px-4 mt-3">
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
          <div className="bg-emerald-400 h-full" style={{ width: seg(own) }} title={`${own} on own tickets`} />
          <div className="bg-amber-300 h-full" style={{ width: seg(other) }} title={`${other} on another key`} />
          <div className="bg-slate-300 h-full" style={{ width: seg(untracked) }} title={`${untracked} untracked`} />
        </div>
        <div className="flex gap-4 mt-1.5 text-[11px] text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1 align-middle" />{own} own ticket</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-300 mr-1 align-middle" />{other} other key</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1 align-middle" />{untracked} untracked</span>
        </div>
      </div>

      {/* Assigned → Shipped → Diverged columns */}
      <div className="grid grid-cols-3 gap-px bg-stone-100 mt-4 border-t border-stone-100">
        <div className="bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Assigned</div>
          <div className="text-[15px] font-semibold text-slate-800 mt-0.5">{r.counts.issues} tickets</div>
          <div className="text-[12px] text-slate-500">{d.unpointedKeys.length ? `${d.unpointedKeys.length} with no story points` : "all estimated"}</div>
        </div>
        <div className="bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Shipped</div>
          <div className="text-[15px] font-semibold text-slate-800 mt-0.5">{total} merged PRs</div>
          <div className="text-[12px] text-slate-500">{f1(r.totalPoints)} pts · {r.avgQuality === null ? "—" : `${f1(r.avgQuality)}/10`} quality</div>
        </div>
        <div className="bg-white px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Diverged</div>
          <div className={`text-[15px] font-semibold mt-0.5 ${tone === "red" ? "text-rose-600" : tone === "amber" ? "text-amber-700" : "text-slate-600"}`}>
            {tone === "red" ? "Needs a look" : tone === "amber" ? "Worth a 1:1" : "Mostly fine"}
          </div>
          <div className="text-[12px] text-slate-500">{total ? `${100 - pct}% off their tickets` : "no proof here yet"}</div>
        </div>
      </div>

      {/* Action chips — HR/PM only (hidden on the employee's own page) */}
      {!employeeView && (d.securityPrs.length || d.mismatchPrs.length || d.noProof || d.scopePrs.length || d.offTicket || d.unpointedKeys.length || d.crossRepoKeys.length || d.noReviewPct >= 0.8) ? (
        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-stone-100 bg-stone-50/40">
          {d.securityPrs.length > 0 && <Chip tone="red" label="🔒 Security review" detail={`PR ${prList(d.securityPrs)} — flag for human review`} />}
          {d.mismatchPrs.length > 0 && <Chip tone="red" label="Title ≠ work" detail={`PR ${prList(d.mismatchPrs)}`} />}
          {d.noProof > 0 && <Chip tone="red" label="Claim without proof" detail={`${d.noProof} ticket${d.noProof > 1 ? "s" : ""} advanced, no merged code`} />}
          {d.scopePrs.length > 0 && <Chip tone="amber" label="Partial delivery" detail={`PR ${prList(d.scopePrs)}`} />}
          {d.offTicket && <Chip tone="amber" label="Off-plan" detail={`only ${pct}% on own tickets`} />}
          {d.unpointedKeys.length > 0 && <Chip tone="grey" label="No story points" detail={keyList(d.unpointedKeys)} />}
          {d.crossRepoKeys.length > 0 && <Chip tone="grey" label="Cross-repo pending" detail={keyList(d.crossRepoKeys)} />}
          {d.noReviewPct >= 0.8 && <Chip tone="grey" label="No peer review" detail={`${Math.round(d.noReviewPct * 100)}% of PRs`} />}
        </div>
      ) : null}

      {/* honesty footnote — HR/PM only (hidden on the employee's own page) */}
      {!employeeView && (
      <div className="px-4 py-2 border-t border-stone-100 text-[11px] text-slate-400 leading-snug">
        One repo · current snapshot (no trend yet) · linkage is literal AB-### matching · grey = fix the ticket/connect a repo, don&apos;t penalise the person.
      </div>
      )}
    </div>
  );
}
