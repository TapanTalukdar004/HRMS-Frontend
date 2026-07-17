"use client";

/**
 * /loop — the "Loop Reviewer" DEMO view.
 *
 * Reads a static demo dataset (public/loop/demo.json) produced offline by the self-verification loop
 * (L0 determinism+spotlighting+evidence-cap -> L1 self-consistency union vote -> L2 diff-grounded
 * verify). It is DEMO data from frozen fixture PRs — NOT the production database. Each card shows the
 * stable score, verdict, goal-match, confidence (n/K), injection flag, and every must-fix finding WITH
 * its verbatim quoted diff evidence. Mirrors the ReviewBoard aesthetic.
 */

import { useEffect, useState } from "react";

type Finding = {
  type?: string; severity?: string; title?: string; why?: string; fix?: string;
  evidence?: string; recurrence?: number; confidence_runs?: string; verify_why?: string;
};
type PR = {
  repo: string; pr_number: number; label?: string; title?: string; goal?: string;
  code_quality?: number | null; verdict?: string; matches_title?: boolean | null;
  confidence?: number | null; samples_k?: number; injection_attempt?: boolean;
  quality_outlier?: boolean; verify_dropped?: number; n_findings?: number;
  findings: Finding[]; reached?: number | null; touches_sensitive?: boolean;
};
type Demo = { generated_at?: string; note?: string; loop?: string; count?: number; prs: PR[] };

const V: Record<string, { accent: string; word: string; cls: string }> = {
  clean: { accent: "border-l-emerald-400", word: "Looks good", cls: "text-emerald-600" },
  "needs-changes": { accent: "border-l-amber-400", word: "Needs changes", cls: "text-amber-600" },
  blocked: { accent: "border-l-rose-400", word: "Blocked", cls: "text-rose-600" },
};
const sevDot = (s?: string) => (s === "critical" ? "bg-rose-500" : "bg-amber-500");

function Field({ label, value, sub, valueCls }: { label: string; value: React.ReactNode; sub?: string; valueCls?: string }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-[15px] font-semibold ${valueCls ?? "text-slate-800"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Card({ pr }: { pr: PR }) {
  const [open, setOpen] = useState(false);
  const v = V[pr.verdict ?? ""] ?? { accent: "border-l-slate-300", word: pr.verdict ?? "—", cls: "text-slate-600" };
  const confPct = pr.confidence != null ? Math.round(pr.confidence * 100) : null;
  const mustFix = pr.findings?.length ?? 0;
  return (
    <div className={`rounded-xl border border-stone-200 border-l-4 ${v.accent} bg-white overflow-hidden`}>
      <div className="flex items-start gap-4 px-4 pt-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-slate-400">
            <span className="font-mono">#{pr.pr_number}</span><span>·</span>
            <span className="truncate">{pr.repo}</span>
            {pr.label && <span className="ml-1 rounded-full bg-[#f0ebff] text-[#6745E8] px-2 py-0.5 text-[10px] uppercase tracking-wider">{pr.label}</span>}
          </div>
          <div className="text-[15px] font-semibold text-slate-900 leading-snug truncate" title={pr.title ?? ""}>{pr.title ?? "—"}</div>
          <p className="mt-1 text-[12px] text-slate-500 leading-snug"><span className="font-medium text-slate-600">Goal:</span> {pr.goal}</p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-bold leading-none ${v.cls}`}>{v.word}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{mustFix ? `${mustFix} must-fix` : "no fix needed"}</div>
          {pr.injection_attempt && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              ⚠ injection flagged
            </div>
          )}
        </div>
      </div>

      {/* labeled fields */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-stone-100 mt-3 border-t border-stone-100">
        <Field label="Code quality" value={<>{pr.code_quality ?? "—"}<span className="text-[11px] text-slate-400">/10</span></>} sub="stable (median of runs)" />
        <Field label="Matches goal" value={pr.matches_title ? "Yes" : "No"} valueCls={pr.matches_title ? "text-emerald-600" : "text-rose-600"} sub="PR + Linear title" />
        <Field label="Confidence" value={confPct != null ? `${confPct}%` : "—"} sub={`${pr.samples_k ?? "?"} independent runs`} />
        <Field label="Security" value={pr.injection_attempt ? "Flagged" : "Clean"} valueCls={pr.injection_attempt ? "text-rose-600" : "text-emerald-600"} sub={pr.quality_outlier ? "score outlier ignored" : "no manipulation"} />
      </div>

      <button onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-2 border-t border-stone-100 text-[12.5px] text-slate-600 hover:bg-stone-50">
        {open ? "▾" : "▸"} How the loop decided{mustFix ? ` · ${mustFix} verified finding${mustFix === 1 ? "" : "s"}` : ""}
      </button>

      {open && (
        <div className="px-4 py-3 border-t border-stone-100 bg-stone-50/40 space-y-3 text-[13px] leading-relaxed">
          <p className="text-[12px] text-slate-500">
            The loop ran <b>{pr.samples_k ?? "?"}</b> independent reviews, took the median score, unioned the
            evidence-backed findings, then verified each against the full diff
            {typeof pr.verify_dropped === "number" && pr.verify_dropped > 0 ? <> (dropped <b>{pr.verify_dropped}</b> that did not hold up)</> : null}.
            Reach: <b>{pr.reached ?? "—"}</b> functions{pr.touches_sensitive ? " · touches sensitive code" : ""}.
          </p>

          <div>
            <div className="text-[11px] font-medium text-slate-500 mb-1.5">Must-fix findings (each quotes the real code)</div>
            {mustFix === 0 ? (
              <div className="text-[12.5px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">Nothing to fix — stable across every run.</div>
            ) : (
              <div className="space-y-2">
                {pr.findings.map((f, i) => (
                  <div key={i} className="rounded-lg border border-stone-200 bg-white p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${sevDot(f.severity)}`} />
                      <span className="font-medium text-slate-700 uppercase">{f.type} · {f.severity}</span>
                      {f.confidence_runs && <span className="ml-auto text-[10px] text-slate-400">seen in {f.confidence_runs} runs</span>}
                    </div>
                    <div className="text-[13px] text-slate-800 mt-1">{f.title}</div>
                    {f.why && <div className="text-[12px] text-slate-500">{f.why}</div>}
                    {f.evidence && (
                      <div className="mt-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Quoted from the diff</div>
                        <pre className="text-[11.5px] font-mono whitespace-pre-wrap bg-slate-900 text-slate-100 rounded px-2 py-1.5 overflow-x-auto">{f.evidence}</pre>
                      </div>
                    )}
                    {f.fix && <div className="text-[12.5px] text-slate-700 mt-1.5 bg-fuchsia-50 rounded px-2 py-1.5"><span className="font-medium text-[#7E22CE]">Fix →</span> {f.fix}</div>}
                    {f.verify_why && <div className="text-[11.5px] text-slate-500 mt-1"><span className="font-medium text-emerald-700">Verified:</span> {f.verify_why}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoopPage() {
  const [data, setData] = useState<Demo | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/loop/demo.json")
      .then((r) => { if (!r.ok) throw new Error(`demo.json ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 pt-20 md:pt-8">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">Loop Reviewer</h1>
          <span className="rounded-full bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">demo</span>
        </div>
        <p className="mt-1.5 text-[13.5px] text-slate-600 leading-relaxed">
          Every PR is reviewed by a <b>self-verifying loop</b>, not a single guess: it runs several independent
          reviews, takes the <b>median</b> score, keeps only findings that <b>quote the real code</b>, then
          <b> verifies</b> each against the full diff. The result is a <b>stable, evidence-backed</b> verdict — the
          same answer every time — with a confidence level and a prompt-injection flag.
        </p>
        <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-[11px]">
          {["L0 · quote-the-code + block hidden orders", "L1 · ask 5×, take the median + union evidence", "L2 · verify each finding on the full diff"].map((s) => (
            <span key={s} className="rounded-full bg-[#fdf0ff] text-[#AE00D0] px-2.5 py-1 font-medium">{s}</span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800 mb-5">
        Demo data — produced offline from frozen sample PRs. This does not read your database or production
        repos. When wired in, the same cards will show real PRs (goal = PR title + Linear issue title).
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">Could not load demo data: {err}. Run <code className="font-mono">python agent/loop_demo_export.py</code> to generate it.</div>}
      {!data && !err && <div className="text-slate-400 text-sm">Loading…</div>}

      {data && (
        <div className="space-y-3">
          {data.prs.map((pr) => <Card key={`${pr.repo}#${pr.pr_number}`} pr={pr} />)}
        </div>
      )}

      {data?.generated_at && (
        <p className="mt-6 text-[11px] text-slate-400">Generated {new Date(data.generated_at).toLocaleString()} · loop: {data.loop}</p>
      )}
    </div>
  );
}
