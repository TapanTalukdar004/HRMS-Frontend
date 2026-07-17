"use client";

/**
 * PREVIEW ONLY — proposed absolute scoring (PRD 10) + the detailed per-employee page, rendered with
 * MOCK data for Akshit / Vaibhav / Nikhil so the design can be reviewed without touching the live
 * dashboard or the database. Not linked from nav. Delete once the design is approved + wired for real.
 */
import { useState } from "react";
import { computeScore, bandOf, FIELD_DEFS, type ScoreInput } from "@/lib/absoluteScore";

type Pr = { n: number; title: string; issue: string; quality: number; reach: "local" | "moderate" | "wide"; merged: string; review: string };
type IssuePr = { n: number; title: string; quality: number; reach: string };
type Issue = { key: string; title: string; priority: string; sp: number; status: string; size: number; quality: number; bug: number; proof: number; together: number; reach: number; points: number; prs: IssuePr[] };
type Emp = {
  name: string; scope: string; components: ScoreInput;
  stats: { avgQuality: number; points: number; mergedPrs: number; proven: number; assigned: number; onPlan: number };
  prs: Pr[]; issues: Issue[]; daily: number[]; strengths: string; toImprove: string[];
};

const EMPLOYEES: Emp[] = [
  {
    name: "Akshit", scope: "cycle 12 · Jun 30 – Jul 11",
    components: { delivery: 0.90, quality: 0.74, craft: 0.92, reach: 0.85 },
    stats: { avgQuality: 7.4, points: 44, mergedPrs: 33, proven: 27, assigned: 41, onPlan: 0.86 },
    prs: [
      { n: 612, title: "Agent run streaming API", issue: "AB-142", quality: 8.6, reach: "wide", merged: "Jul 9", review: "2 reviews" },
      { n: 598, title: "Tool-call retry + backoff", issue: "AB-142", quality: 8.1, reach: "moderate", merged: "Jul 8", review: "1 review" },
      { n: 574, title: "Prompt template registry", issue: "AB-130", quality: 7.2, reach: "moderate", merged: "Jul 5", review: "reviewed" },
    ],
    issues: [
      { key: "AB-142", title: "Streaming agent runs", priority: "urgent", sp: 8, status: "done", size: 16, quality: 0.87, bug: 1.0, proof: 1.0, together: 1.0, reach: 1.25, points: 17.4,
        prs: [{ n: 612, title: "Agent run streaming API", quality: 8.6, reach: "wide" }, { n: 598, title: "Tool-call retry + backoff", quality: 8.1, reach: "moderate" }] },
      { key: "AB-130", title: "Prompt template registry", priority: "high", sp: 5, status: "done", size: 7.5, quality: 0.86, bug: 1.0, proof: 1.0, together: 1.0, reach: 1.1, points: 7.1,
        prs: [{ n: 574, title: "Prompt template registry", quality: 7.2, reach: "moderate" }] },
    ],
    daily: [3, 6, 4, 9, 7, 11, 8, 5, 10, 12, 6, 9],
    strengths: "Consistent, well-reviewed work on high-ripple parts of the agent runtime; clean streaming implementation with solid tests.",
    toImprove: ["2 PRs weren't linked to a ticket — adding the AB-### id lets them get counted here."],
  },
  {
    name: "Vaibhav", scope: "cycle 12 · Jun 30 – Jul 11",
    components: { delivery: 0.83, quality: 0.75, craft: 0.88, reach: 0.70 },
    stats: { avgQuality: 7.5, points: 32, mergedPrs: 19, proven: 19, assigned: 27, onPlan: 1.0 },
    prs: [
      { n: 640, title: "Gateway auth middleware", issue: "AB-201", quality: 8.0, reach: "moderate", merged: "Jul 10", review: "2 reviews" },
      { n: 631, title: "Rate-limit buckets", issue: "AB-201", quality: 7.6, reach: "moderate", merged: "Jul 9", review: "1 review" },
      { n: 619, title: "Request id propagation", issue: "AB-188", quality: 7.1, reach: "local", merged: "Jul 6", review: "reviewed" },
    ],
    issues: [
      { key: "AB-201", title: "Gateway auth + rate limiting", priority: "high", sp: 5, status: "done", size: 7.5, quality: 0.86, bug: 1.0, proof: 1.0, together: 1.0, reach: 1.1, points: 7.1,
        prs: [{ n: 640, title: "Gateway auth middleware", quality: 8.0, reach: "moderate" }, { n: 631, title: "Rate-limit buckets", quality: 7.6, reach: "moderate" }] },
      { key: "AB-188", title: "Trace request ids end-to-end", priority: "medium", sp: 3, status: "done", size: 3, quality: 0.86, bug: 1.0, proof: 1.0, together: 1.0, reach: 1.0, points: 2.6,
        prs: [{ n: 619, title: "Request id propagation", quality: 7.1, reach: "local" }] },
    ],
    daily: [4, 3, 7, 5, 8, 6, 9, 7, 4, 8, 6, 5],
    strengths: "Every shipped PR was on his own tickets and reviewed; dependable delivery on the gateway with no rework.",
    toImprove: ["1 high-priority ticket has no story-point estimate — add one so it can be weighted."],
  },
  {
    name: "Nikhil", scope: "cycle 12 · Jun 30 – Jul 11",
    components: { delivery: 0.70, quality: 0.75, craft: 0.80, reach: 0.75 },
    stats: { avgQuality: 7.5, points: 29, mergedPrs: 18, proven: 4, assigned: 5, onPlan: 0.22 },
    prs: [
      { n: 234, title: "Webhook retry backoff", issue: "AB-142", quality: 8.4, reach: "wide", merged: "Jul 8", review: "1 review" },
      { n: 225, title: "Retry idempotency key", issue: "AB-142", quality: 7.8, reach: "moderate", merged: "Jul 6", review: "self-merged" },
      { n: 219, title: "Pooler config cache", issue: "AB-155", quality: 7.0, reach: "local", merged: "Jul 4", review: "reviewed" },
    ],
    issues: [
      { key: "AB-142", title: "Add webhook retry", priority: "high", sp: 5, status: "done", size: 7.5, quality: 0.87, bug: 1.0, proof: 1.0, together: 1.0, reach: 1.25, points: 6.2,
        prs: [{ n: 234, title: "Webhook retry backoff", quality: 8.4, reach: "wide" }, { n: 225, title: "Retry idempotency key", quality: 7.8, reach: "moderate" }] },
      { key: "AB-155", title: "Cache pooler config", priority: "medium", sp: 3, status: "done", size: 3, quality: 0.86, bug: 1.0, proof: 1.0, together: 1.0, reach: 1.0, points: 5.0,
        prs: [{ n: 219, title: "Pooler config cache", quality: 7.0, reach: "local" }] },
    ],
    daily: [2, 5, 4, 9, 6, 11, 14, 5, 8, 10, 7, 9],
    strengths: "Strong help across the team — much of his best work landed on others' tickets, including a wide-reaching webhook fix.",
    toImprove: [
      "9 of your PRs helped on others' tickets — great, but linking them to your own where relevant credits your delivery.",
      "5 PRs had no ticket id — add AB-### so the work is counted.",
    ],
  },
];

const REACH_CHIP: Record<string, string> = {
  wide: "bg-amber-50 text-amber-700 ring-amber-200",
  moderate: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  local: "bg-stone-100 text-slate-500 ring-stone-200",
};
const BAND_CHIP: Record<string, { word: string; cls: string }> = {
  strong: { word: "strong", cls: "bg-emerald-100 text-emerald-700" },
  ok: { word: "on track", cls: "bg-amber-100 text-amber-700" },
  weak: { word: "building", cls: "bg-rose-100 text-rose-700" },
  none: { word: "no data", cls: "bg-stone-100 text-slate-400" },
};
const PART_COLOR: Record<string, string> = { delivery: "#7B5AFF", quality: "#059669", craft: "#B45309", reach: "#378ADD" };
const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Info({ text }: { text: string }) {
  return <span title={text} className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-stone-200 text-slate-500 text-[9px] cursor-help align-middle">i</span>;
}

function EmployeeDetail({ emp }: { emp: Emp }) {
  const res = computeScore(emp.components);
  const band = BAND_CHIP[bandOf(res.score)];
  const [open, setOpen] = useState<string | null>(emp.issues[0]?.key ?? null);
  const maxDay = Math.max(...emp.daily, 1);

  return (
    <div className="space-y-3">
      {/* 1 — header + score */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-[#7B5AFF]">← Dashboard</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{emp.name}</div>
          <div className="text-[13px] text-slate-500 mt-0.5">ruh-ai/agent-builder · {emp.scope} · <span className="text-emerald-600">{band.word}</span></div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold tabular-nums text-slate-900 leading-none">{res.score}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">performance score /100<Info text={FIELD_DEFS.score} /></div>
          <div className="text-[11px] text-slate-400 mt-1">advisory · your own work only</div>
        </div>
      </div>

      {/* 2 — how your score is built */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="text-sm font-medium text-slate-800 mb-3">How your score is built</div>
        <div className="space-y-2.5">
          {res.parts.map((p) => (
            <div key={p.key}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-700">{p.label} <span className="text-slate-400">×{p.weight.toFixed(2)}</span><Info text={FIELD_DEFS[p.key]} /></span>
                <span className="tabular-nums text-slate-500">{p.value === null ? "—" : p.value.toFixed(2)}</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(p.value ?? 0) * 100}%`, background: PART_COLOR[p.key] }} />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-stone-100 mt-4 pt-3 text-[13px] text-slate-600">
          100 × ({res.parts.map((p) => `${p.weight.toFixed(2)}·${p.value === null ? "—" : p.value.toFixed(2)}`).join(" + ")}) = <b className="text-slate-900 font-medium">{res.score} / 100</b>
        </div>
      </div>

      {/* 3 — key stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { l: "Avg PR quality", v: `${f1(emp.stats.avgQuality)}`, s: "/ 10", c: "#059669", t: FIELD_DEFS.quality },
          { l: "Points earned", v: `${emp.stats.points}`, s: "credited value", c: "#7B5AFF", t: FIELD_DEFS.pointsEarned },
          { l: "Merged PRs", v: `${emp.stats.mergedPrs}`, s: "this cycle", c: "#0f172a", t: "Distinct merged pull requests linked to your issues." },
          { l: "Issues proven", v: `${emp.stats.proven}`, s: `of ${emp.stats.assigned} assigned`, c: "#0f172a", t: FIELD_DEFS.proven },
        ].map((k) => (
          <div key={k.l} className="rounded-xl bg-stone-50 p-3.5">
            <div className="text-[11px] text-slate-400">{k.l}<Info text={k.t} /></div>
            <div className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: k.c }}>{k.v}</div>
            <div className="text-[10px] text-slate-400">{k.s}</div>
          </div>
        ))}
      </div>

      {/* 4 — pull requests FIRST */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-100 text-sm font-medium text-slate-800">Pull requests <span className="text-slate-400 font-normal">· {emp.stats.mergedPrs} merged this cycle</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2 text-left font-medium">PR</th>
                <th className="px-3 py-2 text-left font-medium">Title</th>
                <th className="px-3 py-2 text-left font-medium">Issue</th>
                <th className="px-3 py-2 text-right font-medium">Quality</th>
                <th className="px-3 py-2 text-left font-medium">Reach</th>
                <th className="px-5 py-2 text-left font-medium">Merged</th>
              </tr>
            </thead>
            <tbody>
              {emp.prs.map((p) => (
                <tr key={p.n} className="border-t border-stone-100">
                  <td className="px-5 py-2.5 font-mono text-[11px] text-[#7B5AFF]">#{p.n}</td>
                  <td className="px-3 py-2.5 text-slate-700">{p.title}<div className="text-[10px] text-slate-400">{p.review}</div></td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">{p.issue}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium" style={{ color: p.quality >= 7 ? "#059669" : "#B45309" }}>{f1(p.quality)}</td>
                  <td className="px-3 py-2.5"><span className={`text-[10px] ring-1 ring-inset rounded-full px-2 py-0.5 ${REACH_CHIP[p.reach]}`}>{p.reach}</span></td>
                  <td className="px-5 py-2.5 text-slate-500">{p.merged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2 text-[11px] text-slate-400">Showing {emp.prs.length} of {emp.stats.mergedPrs} · reach = how far the change ripples in the codebase</div>
      </div>

      {/* 5 — Linear issues THEN, each scored + traceable to its PRs */}
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-100 text-sm font-medium text-slate-800">Linear issues — how each is scored</div>
        {emp.issues.map((it) => {
          const isOpen = open === it.key;
          return (
            <div key={it.key} className="border-b border-stone-100 last:border-b-0">
              <button onClick={() => setOpen(isOpen ? null : it.key)} className="w-full px-5 py-3 flex items-center gap-3 hover:bg-stone-50 text-left">
                <span className={`text-slate-400 text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
                <span className="font-mono text-[11px] text-[#7B5AFF]">{it.key}</span>
                <span className="text-[13px] text-slate-800 flex-1">{it.title}</span>
                <span className="text-[11px] text-slate-400">{it.priority} · {it.sp} SP · {it.status}</span>
                <span className="text-base font-semibold tabular-nums text-[#7B5AFF] w-10 text-right">{f1(it.points)}</span>
              </button>
              {isOpen && (
                <div className="px-5 pb-4 pl-11">
                  <div className="rounded-xl bg-stone-50 p-3.5 text-[12px] text-slate-600">
                    <div className="text-slate-800 mb-2.5">
                      Points = Size <b className="font-medium">{f1(it.size)}</b><Info text={FIELD_DEFS.size} /> × Quality <b className="font-medium">{it.quality.toFixed(2)}</b> × Bug {it.bug.toFixed(1)} × Proof {it.proof.toFixed(1)} × Together {it.together.toFixed(1)} × Reach {it.reach.toFixed(2)} = <b className="font-medium text-[#7B5AFF]">{f1(it.points)}</b>
                    </div>
                    {it.prs.map((p) => (
                      <div key={p.n} className="flex items-center justify-between py-1.5 border-t border-stone-200">
                        <span><span className="font-mono text-[11px] text-[#7B5AFF]">#{p.n}</span> <span className="text-slate-600">{p.title}</span></span>
                        <span className="text-slate-500">quality <b className="font-medium text-emerald-600">{f1(p.quality)}</b> · reach {p.reach}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 6 — impact over the cycle */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="text-sm font-medium text-slate-800">Impact over the cycle <span className="text-slate-400 font-normal">· points shipped per day</span></div>
        <div className="flex items-end gap-1.5 h-24 mt-3">
          {emp.daily.map((d, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${Math.max(6, (d / maxDay) * 100)}%`, background: i === emp.daily.indexOf(maxDay) ? "#7B5AFF" : "#C9BCF6" }} title={`${d} points`} />
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 mt-1.5"><span>Jun 30</span><span>peak day: {maxDay} points shipped</span><span>Jul 11</span></div>
      </div>

      {/* recognition + next steps */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-medium mb-1.5">What went well</div>
          <div className="text-[13px] text-emerald-900 leading-relaxed">{emp.strengths}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-1.5">To get even more credit</div>
          <ul className="space-y-1.5">
            {emp.toImprove.map((t, i) => (<li key={i} className="text-[13px] text-slate-600 leading-relaxed flex gap-2"><span className="text-amber-500">•</span>{t}</li>))}
          </ul>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 pt-1">Advisory — this informs a conversation with your manager, never an automatic decision. No rankings or comparison to teammates appear on your own page.</p>
    </div>
  );
}

export default function PreviewClient() {
  const [sel, setSel] = useState(0);
  return (
    <div className="max-w-4xl mx-auto px-5 py-8">
      <div className="rounded-xl bg-[#fdf0ff] border border-[#e9c8f3] px-4 py-3 mb-6 text-[12.5px] text-[#7a0a92]">
        <b className="font-medium">Preview</b> — proposed absolute scoring + the detailed employee page (PRD 10). Mock data for three engineers; not connected to the database, not linked from nav.
      </div>
      <div className="flex gap-2 mb-6">
        {EMPLOYEES.map((e, i) => (
          <button key={e.name} onClick={() => setSel(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${i === sel ? "bg-[#AE00D0] text-white" : "bg-white text-slate-600 border border-stone-200 hover:bg-stone-50"}`}>
            {e.name}
          </button>
        ))}
      </div>
      <EmployeeDetail emp={EMPLOYEES[sel]} />
    </div>
  );
}
