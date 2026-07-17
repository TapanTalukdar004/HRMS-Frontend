/**
 * Shared engineer/issue rendering — used by the HR view (/report) and each
 * employee's own page (/me). Larger, readable fonts. Read-only display.
 */
import { priorityMultLabel, type EmployeeReport, type ProvenPr, type ScoredIssue, type RealPr, type CarryoverIssue } from "@/lib/realReport";

export const f1 = (n: number | null) => (n === null ? "—" : Number(n.toFixed(1)).toString());
export const qTone = (q: number | null) => q === null ? "text-slate-400" : q >= 7 ? "text-emerald-700" : q >= 5 ? "text-amber-700" : "text-rose-700";

function statusChip(s: string | null) {
  const v = (s ?? "").toLowerCase();
  const tone = v.includes("done") || v.includes("approved") ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : v.includes("qa") || v.includes("review") || v.includes("deploy") ? "bg-amber-50 text-amber-800 ring-amber-200"
    : v.includes("dev") || v.includes("progress") ? "bg-blue-50 text-blue-700 ring-blue-200"
    : v.includes("hold") || v.includes("cancel") || v.includes("duplicate") ? "bg-rose-50 text-rose-700 ring-rose-200"
    : "bg-stone-100 text-slate-600 ring-stone-300";
  return <span className={`inline-block text-[12px] ring-1 ring-inset rounded-full px-2 py-0.5 ${tone}`}>{s || "—"}</span>;
}
function confidenceChip(c: string) {
  const map: Record<string, [string, string]> = { high: ["bg-emerald-50 text-emerald-700 ring-emerald-200", "high confidence"], med: ["bg-stone-100 text-slate-600 ring-stone-300", "med confidence"], low: ["bg-amber-50 text-amber-800 ring-amber-200", "low confidence"] };
  const [cls, label] = map[c] ?? map.med;
  return <span className={`inline-block text-[11px] ring-1 ring-inset rounded-full px-1.5 py-0.5 ${cls}`}>{label}</span>;
}
export function bandWord(b: string) { return b === "strong" ? "Strong" : b === "ok" ? "OK" : b === "weak" ? "Needs review" : "No proof"; }

function issueState(s: ScoredIssue): [string, string] {
  if (s.together === "mismatch") return ["Doesn't match the ticket", "bg-rose-50 text-rose-700 ring-rose-200"];
  if (s.together === "pending") return ["Partly here · rest in another repo", "bg-amber-50 text-amber-800 ring-amber-200"];
  if (s.held) return ["Held · open bug", "bg-rose-50 text-rose-700 ring-rose-200"];
  const qv = s.quality;
  if (qv === null) return ["—", "bg-stone-100 text-slate-500 ring-stone-300"];
  if (qv >= 7) return ["Strong", "bg-emerald-50 text-emerald-700 ring-emerald-200"];
  if (qv >= 5) return ["OK", "bg-amber-50 text-amber-700 ring-amber-200"];
  return ["Needs work", "bg-rose-50 text-rose-700 ring-rose-200"];
}
function whyOf(s: ScoredIssue): string {
  let w = s.togetherNotes || s.prs.find((p) => p.merged && p.narrative)?.narrative || "";
  if (w.length > 240) w = w.slice(0, 239) + "…";
  return w;
}

function ProvenPrLine({ pp }: { pp: ProvenPr }) {
  const pr = pp.pr;
  if (!pp.merged) return (
    <li className="flex items-baseline gap-2 text-[13px] opacity-70">
      <span className="font-mono text-slate-400 shrink-0">#{pr.pr_number}</span>
      <span className="text-slate-700 truncate flex-1 min-w-0">{pr.title}</span>
      <span className="text-[12px] text-slate-400 shrink-0">open — scored when merged</span>
    </li>);
  const reviewed = pr.reviews > 0 && !pr.selfMerged;
  return (
    <li className="text-[13px]">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-slate-400 shrink-0">#{pr.pr_number}</span>
        <span className="text-slate-800 truncate flex-1 min-w-0">{pr.title}</span>
        <span className={`tabular-nums font-semibold shrink-0 ${qTone(pp.quality)}`}>{f1(pp.quality)}<span className="text-[11px] text-slate-400">/10</span></span>
      </div>
      <div className="ml-6 mt-1 flex items-center gap-2 flex-wrap text-[11px]">
        <span className="font-mono text-slate-400">+{pr.adds}/−{pr.dels} · {pr.files}f</span>
        {reviewed ? <span className="text-emerald-700">✓ reviewed</span> : <span className="text-amber-700">self-merged</span>}
        {pr.ci === "success" ? <span className="text-emerald-700">CI ✓</span> : pr.ci === "failure" ? <span className="text-rose-700">CI ✗</span> : <span className="text-slate-400">CI —</span>}
        {pr.blastBand && (
          <span className={pr.blastBand === "wide" ? "text-violet-700" : "text-slate-500"} title={`changed ${pr.changedModules.length} module(s) → reaches ${pr.reachedModules.length} downstream`}>
            blast: {pr.blastBand}{pr.reachedSymbols ? ` · ~${pr.reachedSymbols} symbols` : ""}{pr.reachedModules.length ? ` · ${pr.changedModules.length}→${pr.reachedModules.length} modules` : ""}
          </span>
        )}
        {pr.touchesSensitive && <span className="text-rose-600" title="touches auth/security/permission code">⚠ sensitive</span>}
      </div>
    </li>);
}

function IssueBlock({ s }: { s: ScoredIssue }) {
  const i = s.issue;
  const [stateLabel, stateCls] = issueState(s);
  const why = whyOf(s);
  return (
    <details className="px-3 py-3">
      <summary className="cursor-pointer list-none select-none">
        <div className="flex items-center gap-2 flex-wrap text-[14px]">
          <span className="text-slate-300 inline-block w-3">▸</span>
          <span className="font-mono text-[12px] text-slate-500">{i.issue_key}</span>
          {statusChip(i.status)}
          <span className={`inline-block text-[11px] ring-1 ring-inset rounded-full px-2 py-0.5 ${stateCls}`}>{stateLabel}</span>
          {s.blastBand === "wide" && <span className="inline-block text-[11px] ring-1 ring-inset ring-violet-200 bg-violet-50 text-violet-700 rounded-full px-2 py-0.5" title={`wide blast radius — reaches ~${s.reachedSymbols} symbols`}>wide impact</span>}
          {s.riskFlag && <span className="inline-block text-[11px] ring-1 ring-inset ring-rose-200 bg-rose-50 text-rose-700 rounded-full px-2 py-0.5" title="wide + sensitive + weakly reviewed — review before trusting">⚠ review</span>}
          <span className="text-slate-800 truncate flex-1 min-w-0 font-medium">{i.title}</span>
          <span className="text-[15px] tabular-nums font-semibold text-[#7B5AFF]">{s.points === null ? "—" : `${f1(s.points)} pts`}</span>
        </div>
        {why && <p className="ml-5 mt-1.5 text-[13px] text-slate-600 leading-snug">{why}</p>}
      </summary>
      <div className="mt-3 ml-5 space-y-3 border-l-2 border-stone-100 pl-3">
        <div className="text-[12px] text-slate-400 flex items-center gap-2 flex-wrap">
          <span>status: {i.status || "—"}</span><span>·</span><span>{i.estimate ? `${i.estimate} SP` : "no SP"}</span><span>·</span><span>{i.priority || "no priority"}</span><span>·</span>{confidenceChip(s.confidence)}
        </div>
        {/* real Linear dates (changes/173): when it entered the cycle → work began → done */}
        {(i.added_to_cycle_at || i.started_at || i.completed_at) && (
          <div className="text-[12px] text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-400">timeline:</span>
            <span>added {i.added_to_cycle_at ? new Date(i.added_to_cycle_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</span>
            <span className="text-slate-300">→</span>
            <span>started {i.started_at ? new Date(i.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</span>
            <span className="text-slate-300">→</span>
            <span className={i.completed_at ? "text-emerald-700" : ""}>{i.completed_at ? `done ${new Date(i.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "not done yet"}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-slate-500">
          <span className="text-slate-400">how the score is built:</span>
          <span>weight <span className="font-mono text-slate-700">{f1(s.weight)}</span> <span className="text-slate-400">({i.estimate ?? 1}SP×{priorityMultLabel(i.priority)})</span></span>
          <span className="text-slate-300">×</span>
          <span>quality <span className="font-mono text-slate-700">{s.quality === null ? "—" : `${f1(s.quality)}/10`}</span></span>
          {s.bug !== 1 && <><span className="text-slate-300">×</span><span>bug <span className="font-mono text-slate-700">{f1(s.bug)}</span></span></>}
          {s.proof !== 1 && <><span className="text-slate-300">×</span><span>proof <span className="font-mono text-slate-700">{f1(s.proof)}</span></span></>}
          {s.togetherFactor !== 1 && <><span className="text-slate-300">×</span><span className="text-rose-600">together {f1(s.togetherFactor)}</span></>}
          {s.impact !== 1 && <><span className="text-slate-300">×</span><span className="text-violet-700">impact <span className="font-mono">{f1(s.impact)}</span> <span className="text-slate-400">({s.blastBand})</span></span></>}
          <span className="text-slate-300">=</span>
          <span className="font-mono font-semibold text-[#7B5AFF]">{s.points === null ? "—" : `${f1(s.points)} pts`}</span>
        </div>
        {/* Phase D: how this ticket and its PRs moved & linked */}
        <div className="text-[12px] text-slate-500 flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400">journey:</span>
          <span className="font-mono text-[#7B5AFF]">{i.issue_key}</span>
          {s.prs.map((pp) => (
            <span key={pp.pr.pr_number} className="text-slate-400">→&nbsp;<span className={pp.merged ? "text-slate-700 font-mono" : "text-slate-400 font-mono"}>#{pp.pr.pr_number}</span></span>
          ))}
          {s.prs.some((pp) => pp.merged) && <span className="text-emerald-700">→ merged</span>}
          {(i.relates_to ?? []).length > 0 && <span className="text-slate-400">· 🔗 related: <span className="font-mono text-slate-600">{(i.relates_to ?? []).join(", ")}</span></span>}
        </div>
        {s.crossDefects.length > 0 && <ul className="ml-1 list-disc list-inside text-[12px] text-rose-700 space-y-0.5">{s.crossDefects.slice(0, 4).map((d, idx) => <li key={idx}>{d}</li>)}</ul>}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">The PRs <span className="normal-case tracking-normal text-slate-300">· CI = tests passed · self-merged = no peer review · +/− = lines · f = files</span></div>
          <ul className="space-y-2.5">{s.prs.map((pp) => <ProvenPrLine key={pp.pr.pr_number} pp={pp} />)}</ul>
        </div>
      </div>
    </details>
  );
}

export function EngineerCard({ r, defaultOpen = false, carryover = [] }: { r: EmployeeReport; defaultOpen?: boolean; carryover?: CarryoverIssue[] }) {
  const untracked = r.unlinkedPrs.filter((p) => p.link_status === "untracked");
  const external = r.unlinkedPrs.filter((p) => p.link_status === "external_key");
  const suggestByPr = new Map(r.suggestions.map((s) => [s.pr.pr_number, s]));
  const dmy = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
  // ONE assigned list — current no-proof + carried-over ongoing work, uniform rows (no cycle-origin labels),
  // newest-assigned first. Shown together as "assigned, no merged PR yet"; points appear only when proven.
  const assignedRows = [
    ...r.noProofIssues.map((it) => ({ key: it.issue_key, title: it.title, status: it.status, priority: it.priority, sp: it.estimate, assignedAt: it.added_to_cycle_at ?? it.started_at ?? null })),
    ...carryover.map((it) => ({ key: it.issueKey, title: it.title, status: it.status, priority: it.priority, sp: it.estimate, assignedAt: it.assignedAt })),
  ].sort((a, b) => ((a.assignedAt ?? "") < (b.assignedAt ?? "") ? 1 : -1));
  return (
    <details className="group bg-white rounded-xl border border-stone-200 overflow-hidden" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-4 py-3.5 hover:bg-stone-50/60 select-none">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 group-open:rotate-90 transition-transform inline-block w-3 flex-none">▸</span>
          <span className={`flex-none inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold capitalize ${r.band === "strong" ? "bg-emerald-100 text-emerald-700" : r.band === "ok" ? "bg-amber-100 text-amber-700" : r.band === "weak" ? "bg-rose-100 text-rose-700" : "bg-stone-100 text-slate-500"}`}>{r.employee.charAt(0)}</span>
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-slate-900 capitalize text-[16px]">{r.employee}</span>
            <div className="text-[12px] text-slate-500 tabular-nums">{r.mergedPrs} merged PRs · {r.provenIssues.length} proven issues · {r.counts.judged} scored</div>
          </div>
          <div className="hidden sm:flex items-center gap-5 flex-none text-right">
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">PRs</div><div className="text-[15px] font-semibold tabular-nums text-slate-800">{r.mergedPrs}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">quality</div><div className={`text-[15px] font-semibold tabular-nums ${qTone(r.avgQuality)}`}>{f1(r.avgQuality)}</div></div>
            <div><div className="text-[10px] uppercase tracking-wider text-slate-400">points</div><div className="text-[15px] font-semibold tabular-nums text-[#7B5AFF]">{f1(r.totalPoints)}</div></div>
          </div>
        </div>
      </summary>
      <div className="border-t border-stone-100">
        {r.provenIssues.length > 0 ? (
          <>
            <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-emerald-700">Proven work — issues with merged PRs (scored), most PRs first</div>
            <div className="divide-y divide-stone-100">{r.provenIssues.map((s) => <IssueBlock key={s.issue.issue_key} s={s} />)}</div>
          </>
        ) : <div className="px-4 py-3 text-[13px] text-slate-400 italic">No merged PRs in this repo — no proof of work to score here.</div>}

        {assignedRows.length > 0 && (
          <div className="border-t border-stone-100 px-4 py-3 bg-stone-50/40">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Assigned — no merged PR yet ({assignedRows.length}) · not scored</div>
            <ul className="space-y-1">
              {assignedRows.map((it) => (
                <li key={it.key} className="flex items-center gap-2 text-[13px]">
                  <span className="font-mono text-slate-400 shrink-0">{it.key}</span>
                  {statusChip(it.status)}
                  <span className="text-slate-600 truncate">{it.title}</span>
                  <span className="text-[11px] text-slate-400 shrink-0 ml-auto tabular-nums">{it.priority ?? "—"} · {it.sp ?? "—"} SP · assigned {dmy(it.assignedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(untracked.length > 0 || external.length > 0) && (
          <div className="border-t border-stone-100 px-4 py-3 bg-stone-50/40">
            <div className="text-[11px] uppercase tracking-wider text-amber-700 mb-1.5">Unlinked PRs — work with no ticket key ({untracked.length + external.length})</div>
            <ul className="space-y-1">
              {untracked.map((p: RealPr) => { const sug = suggestByPr.get(p.pr_number);
                return (<li key={p.pr_number} className="flex items-baseline gap-2 text-[13px]"><span className="font-mono text-slate-400 shrink-0">#{p.pr_number}</span><span className="text-slate-700 truncate">{p.title}</span>{sug ? <span className="text-[12px] text-[#AE00D0] shrink-0">≈ {sug.issue_key}?</span> : <span className="text-[12px] text-slate-300 shrink-0">— old / unlabeled?</span>}</li>); })}
              {external.map((p: RealPr) => (<li key={p.pr_number} className="flex items-baseline gap-2 text-[13px] opacity-70"><span className="font-mono text-slate-400 shrink-0">#{p.pr_number}</span><span className="text-slate-700 truncate">{p.title}</span><span className="text-[12px] text-slate-400 shrink-0">↗ other/older ticket</span></li>))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
