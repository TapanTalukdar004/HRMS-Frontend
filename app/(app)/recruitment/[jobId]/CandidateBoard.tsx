"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ShortlistActions from "./ShortlistActions";
import ScreenButton from "./ScreenButton";

/** Interactive applicant triage board (PRD 14 R1 — MINIMAL + non-leaky). Each card shows only the
 *  at-a-glance signal: score ring, name + verdict + stage, a short have-vs-missing skill line, and the
 *  one-click action. ALL heavy detail (claims & evidence, per-dimension proof, interview prep) lives on
 *  the candidate PROFILE page ("full profile →"), not here. Advisory: the human decides; nothing here
 *  changes state except the explicit Advance/Reject click (or Screen for an unscreened candidate). */

type PrepQ = { question: string; targets_claim?: string; ownership_signal?: string; strong_answer: string; weak_answer: string };
type PrepArea = { area: string; rationale: string; questions: PrepQ[] };
type Dim = { key: string; label: string; weight: number; score: number; quoted_evidence_line: string; evidence_verified: boolean };
type Claim = { claim: string; evidence_strength: "demonstrated" | "listed_only" | "absent"; firsthand_signal: "firsthand_owned" | "team_or_observed" | "ambiguous"; status: "supported" | "unsupported" | "contradicted"; verify_note: string };

export type CandidateVM = {
  id: string; name: string; email: string; phone: string | null; createdAt: string;
  stage: string; resumeUrl: string | null;
  score: number | null; verdict: string | null; skillMatchPct: number | null;
  dimensions: Dim[]; matched: string[]; missing: string[];
  claims: Claim[]; toVerify: string[]; tldr: string | null;
  verifyCounts: { demonstrated: number; listed_only: number; absent: number } | null;
  mustHaves: { requirement: string; met: boolean }[];
  strengths: string[]; concerns: string[]; summary: string | null;
  evidenceVerified: string | null; extractionMethod: string | null;
  injectionStripped: number | null; scanLimited: boolean; recommended: boolean;
  screenStatus: string | null; screenError: string | null;
  interview: { humanOverall: number | null; recommendation: string | null } | null;
  prep: { summary: string | null; focusAreas: PrepArea[] } | null;
};

const VERDICT_HEX: Record<string, string> = {
  "Strong Fit": "#059669", "Potential Fit": "#d97706", "Partial Match": "#ea580c", "Weak Match": "#e11d48",
};
const REC: Record<string, string> = { strong_yes: "strong yes", yes: "yes", no: "no", strong_no: "strong no" };
const isListed = (s: string) => /\(listed only\)/i.test(s);
const stripListed = (s: string) => s.replace(/\s*\(listed only\)/i, "");

function Ring({ score, color }: { score: number; color: string }) {
  const r = 16, circ = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e7e5e4" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 22 22)" />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill="#334155">{Math.round(score)}</text>
    </svg>
  );
}

const STAGES = ["all", "applied", "screened", "shortlisted", "rejected"] as const;
type SortKey = "score" | "skill" | "newest";

export default function CandidateBoard({ jobId, candidates }: { jobId: string; candidates: CandidateVM[] }) {
  const [sort, setSort] = useState<SortKey>("score");
  const [stage, setStage] = useState<(typeof STAGES)[number]>("all");

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: candidates.length };
    for (const c of candidates) m[c.stage] = (m[c.stage] ?? 0) + 1;
    return m;
  }, [candidates]);

  const view = useMemo(() => {
    const filtered = candidates.filter((c) => stage === "all" || c.stage === stage);
    const val = (c: CandidateVM) => sort === "skill" ? (c.skillMatchPct ?? -1)
      : sort === "newest" ? new Date(c.createdAt).getTime() : (c.score ?? -1);
    return [...filtered].sort((a, b) => val(b) - val(a));
  }, [candidates, sort, stage]);

  const btn = (active: boolean) =>
    `text-[12px] px-2.5 py-1 rounded-md border ${active ? "bg-[#AE00D0] border-[#AE00D0] text-white" : "border-stone-300 text-slate-600 hover:bg-stone-50"}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider mr-0.5">sort</span>
          <button className={btn(sort === "score")} onClick={() => setSort("score")}>score</button>
          <button className={btn(sort === "skill")} onClick={() => setSort("skill")}>skill match</button>
          <button className={btn(sort === "newest")} onClick={() => setSort("newest")}>newest</button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider mr-0.5">stage</span>
          {STAGES.map((st) => (
            <button key={st} className={btn(stage === st)} onClick={() => setStage(st)}>
              {st}{counts[st] ? ` (${counts[st]})` : st === "all" ? " (0)" : ""}
            </button>
          ))}
        </div>
      </div>

      {view.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center text-slate-400 text-sm">No candidates in “{stage}”.</div>
      ) : (
        <div className="space-y-2.5">
          {view.map((c) => {
            const color = VERDICT_HEX[c.verdict ?? ""] ?? "#64748b";
            const unmet = c.mustHaves.filter((m) => !m.met).map((m) => m.requirement);
            const gapChips = [...unmet, ...c.missing.filter((m) => !unmet.some((u) => u.toLowerCase() === m.toLowerCase()))].slice(0, 3);
            const haveDemo = c.matched.filter((s) => !isListed(s));
            const haveListed = c.matched.filter(isListed).map(stripListed);
            const extra = haveDemo.length + haveListed.length - 4;
            return (
              <div key={c.id} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
                <div className="flex items-start gap-3">
                  {c.score != null ? <Ring score={c.score} color={color} /> : (
                    <div className="w-11 h-11 shrink-0 rounded-full border border-dashed border-stone-300 flex items-center justify-center text-[9px] text-slate-400 text-center leading-tight">not<br/>screened</div>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* identity + verdict */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/recruitment/${jobId}/candidate/${c.id}`} className="font-medium text-[15px] text-slate-900 hover:text-[#AE00D0] hover:underline">{c.name}</Link>
                      {c.verdict && <span className="text-[11.5px] font-medium" style={{ color }}>{c.verdict}</span>}
                      <span className={`text-[10px] uppercase rounded-full px-2 py-0.5 ${c.stage === "shortlisted" ? "bg-emerald-100 text-emerald-700" : c.stage === "rejected" ? "bg-rose-100 text-rose-700" : "bg-[#fdf0ff] text-[#AE00D0]"}`}>{c.stage}</span>
                      {c.recommended && c.stage !== "shortlisted" && c.stage !== "rejected" && (
                        <span className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 px-2 py-0.5">★ recommended</span>
                      )}
                    </div>

                    {/* short skills line — gap first, then a few haves (the ONE thing this card exists to show) */}
                    {(gapChips.length > 0 || haveDemo.length > 0 || haveListed.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {gapChips.map((s, i) => <span key={`g${i}`} title={`missing: ${s}`} className="text-[11.5px] rounded bg-rose-50 text-rose-700 px-1.5 py-0.5">✗ {s}</span>)}
                        {haveDemo.slice(0, 4).map((s, i) => <span key={`h${i}`} className="text-[11.5px] rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5">{s}</span>)}
                        {haveListed.slice(0, Math.max(0, 4 - haveDemo.length)).map((s, i) => <span key={`l${i}`} title="named on the résumé but not shown in any project" className="text-[11.5px] rounded bg-amber-50 text-amber-700 px-1.5 py-0.5">{s} · listed</span>)}
                        {extra > 0 && <span className="text-[11px] text-slate-400">+{extra}</span>}
                      </div>
                    )}

                    {/* minimal meta row — everything deeper is on the profile */}
                    <div className="mt-2 flex items-center gap-2.5 text-[11px] flex-wrap">
                      <Link className="text-slate-500 hover:text-[#AE00D0] hover:underline" href={`/recruitment/${jobId}/candidate/${c.id}`}>full profile →</Link>
                      {c.resumeUrl ? <a className="text-[#AE00D0] hover:underline" href={c.resumeUrl} target="_blank" rel="noreferrer">resume</a> : <span className="text-slate-400">no resume</span>}
                      {(c.stage === "shortlisted" || c.interview) && (c.interview
                        ? <Link className="text-emerald-700 hover:underline" href={`/recruitment/${jobId}/interview/${c.id}`}>✓ interviewed · {c.interview.humanOverall}/100{c.interview.recommendation ? ` · ${REC[c.interview.recommendation] ?? c.interview.recommendation}` : ""}</Link>
                        : <Link className="text-[#AE00D0] hover:underline" href={`/recruitment/${jobId}/interview/${c.id}`}>record interview →</Link>)}
                      {c.injectionStripped ? <span className="text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5">⚠ hidden text stripped</span> : null}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {c.score != null
                      ? <ShortlistActions id={c.id} stage={c.stage} />
                      : <ScreenButton id={c.id} status={c.screenStatus} error={c.screenError} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
