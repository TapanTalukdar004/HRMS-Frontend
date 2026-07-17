import Link from "next/link";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { signedResumeUrl } from "@/lib/resumeStorage";
import ShortlistActions from "../../ShortlistActions";
import ScreenButton from "../../ScreenButton";
import { computeLedger } from "@/lib/ledger";

/** Per-candidate detail page (Track 3) — the full profile HR opens by clicking a candidate: fit by
 *  dimension with proof-first quoted evidence, matched/missing skills, must-haves, strengths/concerns,
 *  the interview questionnaire, and the interview result. HR-only. Advisory: the score guides; a human
 *  decides via Advance/Reject. "Download profile PDF" produces the branded RUH dossier. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScreenDim = { key: string; label: string; weight: number; score: number; quoted_evidence_line: string; evidence_verified: boolean; note: string };
type Claim = {
  claim: string; category: string; evidence_strength: "demonstrated" | "listed_only" | "absent";
  firsthand_signal: "firsthand_owned" | "team_or_observed" | "ambiguous";
  status: "supported" | "unsupported" | "contradicted"; resume_locus: string; verify_note: string;
};
type VerificationSummary = { demonstrated_count?: number; listed_only_count?: number; absent_count?: number; top_claims_to_verify?: string[] };
type Detail = {
  dimensions?: ScreenDim[]; matched_skills?: string[]; missing_skills?: string[];
  strengths?: string[]; concerns?: string[]; tldr?: string; summary?: string; evidence_verified?: string;
  claims?: Claim[]; verification_summary?: VerificationSummary;
  injection_flags?: { detected: boolean; stripped: number; reasons: string[] };
  must_haves?: { requirement: string; met: boolean; evidence_line: string }[];
  scan_limited?: boolean; extraction_method?: string;
};
type Cand = { id: string; job_post_id: string; name: string; email: string; phone: string | null; stage: string; resume_path: string | null; created_at: string; screen_status: string | null; screen_error: string | null; form_answers: Record<string, unknown> | null; prep_status: string | null; prep_error: string | null };
type Screen = { overall_score: number | null; verdict_label: string | null; detail: Detail | null };
type PrepQ = { question: string; targets_claim?: string; ownership_signal?: string; strong_answer: string; weak_answer: string };
type PrepArea = { area: string; rationale: string; questions: PrepQ[] };
type Rating = { competencies: { key: string; label: string; rating: number | null; anchor_label: string | null; evidence: string; not_assessed: boolean }[]; overall_recommendation: string | null; human_overall: number | null; notes: string | null };
type RoundRating = { round_seq: number; round_score_0_100: number | null; verdict: string | null };
type RoundMeta = { seq: number; name: string; weight: number };

const VERDICT_HEX: Record<string, string> = { "Strong Fit": "#059669", "Potential Fit": "#d97706", "Partial Match": "#ea580c", "Weak Match": "#e11d48" };
const REC: Record<string, string> = { strong_yes: "Strong yes", yes: "Yes", no: "No", strong_no: "Strong no" };
const barColor = (s: number) => (s >= 75 ? "#059669" : s >= 55 ? "#d97706" : s >= 40 ? "#ea580c" : "#e11d48");

function Ring({ score, color }: { score: number; color: string }) {
  const r = 26, circ = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0" aria-hidden="true">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#e7e5e4" strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 34 34)" />
      <text x="34" y="34" textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="700" fill="#334155">{Math.round(score)}</text>
    </svg>
  );
}

export default async function CandidateDetail({ params }: { params: Promise<{ jobId: string; candidateId: string }> }) {
  const { jobId, candidateId } = await params;
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct || acct.role !== "hr") {
    return <main className="max-w-3xl mx-auto px-4 py-6 pt-20 md:pt-6"><div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-500">This page is available to HR only.</div></main>;
  }

  let cand: Cand | null = null;
  let jobTitle = "", jobLevel: string | null = null;
  let screen: Screen | null = null;
  let prep: { focus_areas?: PrepArea[]; summary?: string } | null = null;
  let roundRatings: RoundRating[] = [];
  let roundsMeta: RoundMeta[] = [];
  let phaseWeights: { screening?: number; rounds?: number } | null = null;
  let rating: Rating | null = null;
  let resumeUrl: string | null = null;
  try {
    cand = (await q<Cand>("SELECT id, job_post_id, name, email, phone, stage, resume_path, created_at, screen_status, screen_error, form_answers, prep_status, prep_error FROM candidates WHERE id = $1::uuid AND job_post_id = $2", [candidateId, jobId]))[0] ?? null;
    if (cand) {
      const j = (await q<{ title: string; level: string | null }>("SELECT title, level FROM job_posts WHERE id = $1", [jobId]))[0];
      jobTitle = j?.title ?? ""; jobLevel = j?.level ?? null;
      screen = (await q<Screen>("SELECT overall_score::float8 AS overall_score, verdict_label, detail FROM screenings WHERE candidate_id = $1::uuid", [candidateId]))[0] ?? null;
      prep = (await q<{ questions: { focus_areas?: PrepArea[]; summary?: string } | null }>("SELECT questions FROM interview_prep WHERE candidate_id = $1::uuid", [candidateId]))[0]?.questions ?? null;
      roundRatings = await q<RoundRating>("SELECT round_seq, round_score_0_100::float8 AS round_score_0_100, verdict FROM interview_round_ratings WHERE candidate_id = $1::uuid", [candidateId]);
      roundsMeta = await q<RoundMeta>("SELECT seq, name, weight::float8 AS weight FROM job_rounds WHERE job_post_id = $1 ORDER BY seq", [jobId]);
      phaseWeights = (await q<{ phase_weights: { screening?: number; rounds?: number } | null }>("SELECT phase_weights FROM job_rubrics WHERE job_post_id = $1 ORDER BY version DESC LIMIT 1", [jobId]))[0]?.phase_weights ?? null;
      rating = (await q<Rating>("SELECT competencies, overall_recommendation, human_overall::float8 AS human_overall, notes FROM interview_human_ratings WHERE candidate_id = $1::uuid", [candidateId]))[0] ?? null;
      if (cand.resume_path) resumeUrl = await signedResumeUrl(cand.resume_path);
    }
  } catch { /* invalid uuid */ }

  if (!cand) {
    return <main className="max-w-3xl mx-auto px-4 py-6 pt-20 md:pt-6"><Link href={`/recruitment/${jobId}`} className="text-[13px] text-[#AE00D0] hover:underline">← Back</Link><div className="mt-6 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">Candidate not found.</div></main>;
  }

  const d = screen?.detail ?? null;
  const matched = d?.matched_skills ?? [], missing = d?.missing_skills ?? [];
  const total = matched.length + missing.length;
  const skillPct = total > 0 ? Math.round((matched.length / total) * 100) : null;
  const color = VERDICT_HEX[screen?.verdict_label ?? ""] ?? "#64748b";
  const claims = d?.claims ?? [];
  const vsum = d?.verification_summary ?? null;
  const toVerify = vsum?.top_claims_to_verify ?? [];
  const CLAIM_TONE: Record<string, string> = {
    demonstrated: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    listed_only: "bg-amber-100 text-amber-800 ring-amber-200",
    absent: "bg-stone-200 text-stone-600 ring-stone-300",
  };
  const CLAIM_WORD: Record<string, string> = { demonstrated: "demonstrated", listed_only: "listed only", absent: "not found" };

  // ---- brief (the 10-second read) derived values ----
  const stripPrefix = (s: string) => s.replace(/^\((a|b)\)\s*(DEMONSTRATED|CLAIMED,?\s*TO VERIFY):\s*/i, "").trim();
  const tldrText = (d?.tldr && d.tldr.trim())
    || (d?.summary ? stripPrefix(d.summary.split(/(?<=\.)\s/)[0]) : "")
    || (d?.strengths?.[0] ?? "");
  const isListed = (s: string) => /\(listed only\)/i.test(s);
  const haveDemo = matched.filter((s) => !isListed(s));
  const haveListed = matched.filter(isListed).map((s) => s.replace(/\s*\(listed only\)/i, ""));
  const mustHaves = d?.must_haves ?? [];
  const unmetMust = mustHaves.filter((m) => !m.met).map((m) => m.requirement);
  const gap = [...unmetMust, ...missing.filter((m) => !unmetMust.some((u) => u.toLowerCase() === m.toLowerCase()))];
  const dCount = vsum?.demonstrated_count ?? claims.filter((c) => c.evidence_strength === "demonstrated").length;
  const lCount = vsum?.listed_only_count ?? claims.filter((c) => c.evidence_strength === "listed_only").length;
  const aCount = vsum?.absent_count ?? claims.filter((c) => c.evidence_strength === "absent").length;
  const proofTotal = dCount + lCount + aCount;
  const toVerifyN = lCount + aCount;
  const leadQuestions = (prep?.focus_areas ?? []).slice(0, 3).map((a) => a.questions?.[0]).filter(Boolean) as PrepQ[];
  const totalQ = (prep?.focus_areas ?? []).reduce((n, a) => n + (a.questions?.length ?? 0), 0);
  const ratingBySeq: Record<number, RoundRating> = Object.fromEntries(roundRatings.map((r) => [r.round_seq, r]));
  const ledger = roundsMeta.length ? computeLedger({
    screeningScore: screen?.overall_score ?? null,
    phaseWeights,
    rounds: roundsMeta.map((rm) => ({ seq: rm.seq, name: rm.name, weight: rm.weight, score: ratingBySeq[rm.seq]?.round_score_0_100 ?? null })),
  }) : null;

  const Chip = ({ tone, children, title: t }: { tone: "have" | "listed" | "gap"; children: React.ReactNode; title?: string }) => {
    const cls = tone === "have" ? "bg-emerald-50 text-emerald-700" : tone === "listed" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
    return <span title={t} className={`inline-block rounded px-2 py-0.5 text-[12.5px] ${cls}`}>{tone === "gap" ? "✗ " : ""}{children}</span>;
  };
  const Section = ({ title, subtitle, id, children }: { title: string; subtitle?: string; id?: string; children: React.ReactNode }) => (
    <div id={id} className="rounded-xl border border-stone-200 bg-white p-5 scroll-mt-20">
      <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-[12.5px] text-slate-400 mt-0.5 mb-3">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </div>
  );
  const Collapsible = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
    <details className="group rounded-xl border border-stone-200 bg-white overflow-hidden">
      <summary className="flex items-center justify-between gap-2 px-5 py-3.5 cursor-pointer list-none hover:bg-stone-50">
        <span className="text-[14px] font-semibold text-slate-700">{title}</span>
        <span className="flex items-center gap-2 text-slate-400">{hint && <span className="text-[12px]">{hint}</span>}<span className="text-[12px] transition-transform group-open:rotate-90">▸</span></span>
      </summary>
      <div className="px-5 pb-5 pt-1 border-t border-stone-100">{children}</div>
    </details>
  );

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-6 pt-20 md:pt-6 space-y-4">
      <Link href={`/recruitment/${jobId}`} className="text-[13px] text-[#AE00D0] hover:underline">← {jobTitle || "applicants"}</Link>

      {/* header */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{cand.name}</h1>
            <div className="text-[12.5px] text-slate-500 mt-1">{cand.email}{cand.phone ? ` · ${cand.phone}` : ""}{jobLevel ? ` · ${jobLevel}` : ""} · applied {new Date(cand.created_at).toLocaleDateString()}</div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] uppercase rounded-full px-2 py-0.5 ${cand.stage === "shortlisted" ? "bg-emerald-100 text-emerald-700" : cand.stage === "rejected" ? "bg-rose-100 text-rose-700" : "bg-[#fdf0ff] text-[#AE00D0]"}`}>{cand.stage}</span>
              {screen && <ShortlistActions id={cand.id} stage={cand.stage} />}
            </div>
          </div>
          {screen?.overall_score != null && (
            <div className="text-center shrink-0">
              <Ring score={screen.overall_score} color={color} />
              <div className="text-[11px] font-medium mt-1" style={{ color }}>{screen.verdict_label}</div>
              {d?.evidence_verified && <div className="text-[10px] text-slate-400">evidence {d.evidence_verified}</div>}
            </div>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-stone-100 flex items-center gap-3 text-[12px] flex-wrap">
          {resumeUrl ? <a className="text-[#AE00D0] hover:underline" href={resumeUrl} target="_blank" rel="noreferrer">↗ resume</a> : <span className="text-slate-400">no resume</span>}
          <a className="text-[#8b27ff] hover:underline" href={`/api/candidates/${cand.id}/dossier`} target="_blank" rel="noreferrer">↓ download profile PDF</a>
          {roundsMeta.length > 0
            ? (["shortlisted", "interviewed", "offer", "hired"].includes(cand.stage)
                ? <Link className={`hover:underline ${ledger?.complete ? "text-emerald-700" : "text-[#AE00D0]"}`} href={`/recruitment/${jobId}/interview/${cand.id}`}>{ledger?.complete ? `✓ interviewed · ${ledger.overall}/100` : "record / continue interview →"}</Link>
                : null)
            : ((cand.stage === "shortlisted" || rating)
                ? (rating
                    ? <Link className="text-emerald-700 hover:underline" href={`/recruitment/${jobId}/interview/${cand.id}`}>✓ interviewed · {rating.human_overall}/100</Link>
                    : <Link className="text-[#AE00D0] hover:underline" href={`/recruitment/${jobId}/interview/${cand.id}`}>record interview →</Link>)
                : null)}
          {d?.injection_flags?.detected && <span className="text-rose-700 bg-rose-50 ring-1 ring-inset ring-rose-200 rounded-full px-2 py-0.5">⚠ hidden text stripped ({d.injection_flags.stripped})</span>}
          {d?.scan_limited && <span className="text-slate-400">scan-limited</span>}
        </div>
      </div>

      {ledger && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h2 className="text-[15px] font-semibold text-slate-800">Selection ledger</h2>
            {ledger.overall != null
              ? <span className="text-[13px] font-bold text-slate-900">Overall {ledger.overall}/100</span>
              : <span className="text-[12px] text-amber-600">in progress · {ledger.ratedRounds}/{ledger.totalRounds} rounds rated</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[22rem]">
              <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="text-left font-medium py-1">Phase</th><th className="text-right font-medium py-1">Weight</th><th className="text-right font-medium py-1">Score</th><th className="text-right font-medium py-1">Contribution</th></tr></thead>
              <tbody>
                {ledger.rows.map((row) => (
                  <tr key={row.key} className="border-t border-stone-100">
                    <td className="py-1.5 text-slate-700">{row.label}</td>
                    <td className="py-1.5 text-right text-slate-400 tabular-nums">{row.overallWeight}%</td>
                    <td className="py-1.5 text-right text-slate-800 tabular-nums">{row.score != null ? `${row.score}/100` : "—"}</td>
                    <td className="py-1.5 text-right text-slate-600 tabular-nums">{row.contribution != null ? `+${row.contribution}` : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-stone-200 font-semibold">
                  <td className="py-1.5 text-slate-800">Overall</td>
                  <td className="py-1.5 text-right text-slate-400 tabular-nums">100%</td>
                  <td></td>
                  <td className="py-1.5 text-right text-slate-900 tabular-nums">{ledger.overall != null ? `${ledger.overall}/100` : "pending"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Weighted across screening + interview rounds (Δ1). Ranking-only — a human decides advance / reject / offer / hire.</p>
        </div>
      )}

      {(() => {
        const fa = (cand.form_answers && typeof cand.form_answers === "object") ? (cand.form_answers as Record<string, unknown>) : {};
        const s = (k: string) => { const v = fa[k]; return v == null ? "" : String(v).trim(); };
        const rows: { k: string; v: string; link?: boolean }[] = [];
        const push = (k: string, v: string, link = false) => { if (v) rows.push({ k, v, link }); };
        const exp = s("total_experience");
        push("Total experience", exp ? `${exp} yrs` : "");
        push("Current location", s("current_location"));
        push("Current CTC", s("current_ctc"));
        push("Expected CTC", s("expected_ctc"));
        push("Notice period", s("notice_period"));
        push("Earliest start", s("earliest_start"));
        push("Willing to relocate", s("relocate"));
        push("LinkedIn", s("linkedin_url"), true);
        push("Portfolio / GitHub", s("portfolio_url"), true);
        const custom = Array.isArray(fa.custom) ? (fa.custom as { q?: unknown; a?: unknown }[]) : [];
        if (rows.length === 0 && custom.length === 0) return null;
        return (
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="text-[13px] font-semibold text-slate-700 mb-2.5">Candidate details</div>
            {rows.length > 0 && (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
                {rows.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <dt className="text-slate-400 w-36 shrink-0">{r.k}</dt>
                    <dd className="text-slate-800 min-w-0">
                      {r.link ? <a className="text-[#AE00D0] hover:underline break-all" href={r.v} target="_blank" rel="noreferrer">{r.v}</a> : r.v}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {custom.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100 space-y-2.5">
                {custom.map((c, i) => (
                  <div key={i}>
                    <div className="text-[12px] font-medium text-slate-600">{String(c.q ?? "")}</div>
                    <div className="text-[13px] text-slate-800 whitespace-pre-wrap">{String(c.a ?? "")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {!screen ? (
        <div className="rounded-xl border border-stone-200 bg-white p-8 text-center space-y-3">
          <p className="text-slate-500 text-sm">
            {cand.screen_status === "failed"
              ? "Screening failed — retry below."
              : cand.screen_status === "processing" || cand.screen_status === "pending"
              ? "Screening in progress… the fit breakdown appears when it finishes (~30–120s)."
              : "Not screened yet. Screen this candidate to see the fit breakdown."}
          </p>
          {cand.screen_status === "failed" && cand.screen_error && (
            <p className="text-[12px] text-rose-600 max-w-md mx-auto">✗ {cand.screen_error}</p>
          )}
          <div className="flex justify-center">
            <ScreenButton id={cand.id} status={cand.screen_status} error={cand.screen_error} />
          </div>
        </div>
      ) : (
        <>
          {/* BRIEF — the 10-second read: who they are, what they have, what to ask */}
          <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
            {tldrText && <p className="text-[15px] leading-relaxed text-slate-800 border-l-2 border-[#AE00D0] pl-3">{tldrText}</p>}

            {(haveDemo.length + haveListed.length + gap.length) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {gap.slice(0, 6).map((s, i) => <Chip key={`g${i}`} tone="gap" title={s}>{s}</Chip>)}
                {haveDemo.slice(0, 6).map((s) => <Chip key={`h${s}`} tone="have">{s}</Chip>)}
                {haveListed.slice(0, Math.max(0, 6 - haveDemo.length)).map((s) => <Chip key={`l${s}`} tone="listed" title="named on the résumé but not shown in any project">{s} · listed</Chip>)}
                {haveDemo.length + haveListed.length > 6 && <span className="text-[12px] text-slate-400">+{haveDemo.length + haveListed.length - 6} more</span>}
                {gap.length > 6 && <span className="text-[12px] text-slate-400">+{gap.length - 6} more gaps</span>}
              </div>
            )}

            {proofTotal > 0 && (
              <div>
                <div className="flex h-2 rounded-full overflow-hidden bg-stone-200" title={`${dCount} demonstrated · ${lCount} listed-only · ${aCount} not found`}>
                  {dCount > 0 && <div style={{ width: `${(dCount / proofTotal) * 100}%`, background: "#059669" }} />}
                  {lCount > 0 && <div style={{ width: `${(lCount / proofTotal) * 100}%`, background: "#d97706" }} />}
                  {aCount > 0 && <div style={{ width: `${(aCount / proofTotal) * 100}%`, background: "#a8a29e" }} />}
                </div>
                <div className="text-[12px] text-slate-500 mt-1 tabular-nums">{dCount} demonstrated · {lCount} listed-only · {aCount} not found{toVerifyN > 0 && <span className="text-amber-700 font-medium"> — {toVerifyN} to verify</span>}</div>
              </div>
            )}

            {(leadQuestions.length > 0 || toVerify.length > 0) && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-indigo-500 font-semibold mb-1.5">Ask in the interview</div>
                {leadQuestions.length > 0 ? (
                  <ol className="space-y-2 list-decimal pl-4 marker:text-slate-400 marker:font-semibold">
                    {leadQuestions.map((qq, i) => (
                      <li key={i} className="text-[14px]">
                        <span className="text-slate-800 font-medium leading-snug">{qq.question}</span>
                        {qq.targets_claim && <span className="ml-1.5 inline-block text-[11.5px] rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 align-middle">Proves: {qq.targets_claim}</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="text-[14px] text-slate-800">Ask about: {toVerify[0]}</div>
                )}
                {totalQ > leadQuestions.length && <a href="#prep" className="inline-block mt-2 text-[12.5px] text-[#AE00D0] hover:underline">+ full questionnaire ({totalQ} questions) →</a>}
              </div>
            )}

            <div className="text-[11.5px] text-slate-400 pt-1 border-t border-stone-100">Self-reported résumé — nothing here is verified. Full breakdown below.</div>
          </div>

          {/* DEPTH — on demand */}
          {claims.length > 0 && (
            <Collapsible title="Claims &amp; evidence" hint={`${dCount} proven · ${toVerifyN} to verify`}>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 mb-3">Every résumé claim, graded by how well the résumé itself backs it up. A human decides.</div>
              <div className="flex flex-wrap gap-2 mb-3 text-[12.5px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1"><b>{dCount}</b> demonstrated</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1"><b>{lCount}</b> listed only</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 text-stone-600 px-2.5 py-1"><b>{aCount}</b> not found</span>
              </div>
              <ul className="space-y-2.5">
                {claims.map((c, i) => (
                  <li key={i} className="border-b border-stone-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className={`shrink-0 text-[11px] uppercase tracking-wide rounded-full ring-1 ring-inset px-2 py-0.5 ${CLAIM_TONE[c.evidence_strength] ?? CLAIM_TONE.absent}`}>{CLAIM_WORD[c.evidence_strength] ?? c.evidence_strength}</span>
                      <span className="text-[13.5px] text-slate-800 font-medium min-w-0">{c.claim}</span>
                      {c.firsthand_signal === "team_or_observed" && <span className="shrink-0 text-[11px] rounded-full bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200 px-2 py-0.5" title="reads as team / observed, not personally owned">team / observed</span>}
                      {c.status === "contradicted" && <span className="shrink-0 text-[11px] rounded-full bg-rose-100 text-rose-700 px-2 py-0.5">contradicted</span>}
                    </div>
                    {c.verify_note && <div className="text-[12.5px] text-slate-500 mt-1 pl-0.5"><span className="text-amber-700 font-medium">To probe:</span> {c.verify_note}</div>}
                  </li>
                ))}
              </ul>
            </Collapsible>
          )}

          {(d?.dimensions?.length ?? 0) > 0 && (
            <Collapsible title="Fit by dimension" hint={screen.overall_score != null ? `${Math.round(screen.overall_score)}/100` : undefined}>
              <div className="space-y-3">
                {d!.dimensions!.map((dim) => (
                  <div key={dim.key}>
                    <div className="flex items-center justify-between text-[13.5px]">
                      <span className="font-medium text-slate-700">{dim.label} <span className="text-slate-400">({dim.weight}%)</span></span>
                      <span className="font-semibold text-slate-800">{dim.score}/100 {dim.evidence_verified ? <span className="text-emerald-600" title="supporting quote found verbatim">✓</span> : <span className="text-amber-600" title="quote not found verbatim — verify in interview">⚠</span>}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-stone-200 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${dim.score}%`, background: barColor(dim.score) }} /></div>
                    {dim.quoted_evidence_line && (
                      <div className="mt-1.5">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-0.5">Resume states</div>
                        <pre className="text-[12.5px] font-mono whitespace-pre-wrap bg-slate-900 text-slate-100 rounded px-2.5 py-2 overflow-x-auto">{dim.quoted_evidence_line}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          {((d?.strengths?.length ?? 0) > 0 || (d?.concerns?.length ?? 0) > 0 || d?.summary || toVerify.length > 0) && (
            <Collapsible title="Full assessment">
              {d?.summary && <p className="text-[14px] leading-relaxed text-slate-700 mb-3">{d.summary}</p>}
              {(d?.strengths?.length ?? 0) > 0 && <div className="text-[13.5px] text-slate-600 mb-1.5"><span className="font-semibold text-emerald-700">Demonstrated:</span> {d!.strengths!.join(" · ")}</div>}
              {(d?.concerns?.length ?? 0) > 0 && <div className="text-[13.5px] text-slate-600 mb-2"><span className="font-semibold text-rose-700">Concerns:</span> {d!.concerns!.join(" · ")}</div>}
              {toVerify.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <div className="text-[13px] font-semibold text-amber-800 mb-1">Claimed — to verify in interview</div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-amber-900">
                    {toVerify.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              )}
            </Collapsible>
          )}

          {(matched.length + missing.length + mustHaves.length) > 0 && (
            <Collapsible title="All skills &amp; must-haves" hint={skillPct != null ? `${skillPct}% match` : undefined}>
              <div className="text-[13px] mb-1.5"><span className="text-emerald-700 font-medium mr-1.5">have</span>{matched.length ? matched.map((s) => <span key={s} className={`inline-block rounded px-2 py-0.5 mr-1.5 mb-1.5 text-[12.5px] ${isListed(s) ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{s}</span>) : <span className="text-slate-400">—</span>}</div>
              <div className="text-[13px] mb-2.5"><span className="text-rose-700 font-medium mr-1.5">gap</span>{missing.length ? missing.map((s) => <span key={s} className="inline-block bg-rose-50 text-rose-700 rounded px-2 py-0.5 mr-1.5 mb-1.5 text-[12.5px]">{s}</span>) : <span className="text-slate-400">—</span>}</div>
              {mustHaves.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-stone-100">
                  {mustHaves.map((m, k) => (
                    <span key={k} className={`text-[12.5px] rounded px-2 py-0.5 ${m.met ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{m.met ? "✓" : "✗"} {m.requirement}</span>
                  ))}
                </div>
              )}
            </Collapsible>
          )}
        </>
      )}

      {roundsMeta.length > 0 ? (
        <Section id="prep" title="Interview" subtitle="Questions + scoring live on the record-interview page — this is the status.">
          <div className="space-y-1.5">
            {roundsMeta.map((rm) => {
              const rr = ratingBySeq[rm.seq];
              return (
                <div key={rm.seq} className="flex items-center justify-between text-[13px] rounded-lg border border-stone-200 bg-white px-3 py-2">
                  <span className="text-slate-700">Round {rm.seq}: {rm.name} <span className="text-[11px] text-slate-400">· {rm.weight}%</span></span>
                  {rr
                    ? <span className="text-emerald-700 font-medium">{rr.round_score_0_100}/100 · {rr.verdict ? rr.verdict.replace(/_/g, " ") : "rated"}</span>
                    : <span className="text-slate-400">pending</span>}
                </div>
              );
            })}
          </div>
          {cand.stage !== "rejected" && cand.stage !== "hired" && (
            <Link href={`/recruitment/${jobId}/interview/${cand.id}`} className="inline-block mt-3 text-[13px] font-medium rounded-lg bg-[#AE00D0] text-white px-4 py-2 hover:bg-[#9000AE]">Record / continue interview →</Link>
          )}
        </Section>
      ) : (cand.stage === "shortlisted" || cand.stage === "interviewed") ? (
        <Section id="prep" title="Interview">
          <p className="text-[13px] text-slate-600 mb-3">Run the interview from the record page — questions + scoring are there.</p>
          <Link href={`/recruitment/${jobId}/interview/${cand.id}`} className="inline-block text-[13px] font-medium rounded-lg bg-[#AE00D0] text-white px-4 py-2 hover:bg-[#9000AE]">Record interview →</Link>
        </Section>
      ) : null}

      {/* Legacy single-interview result — ONLY for postings with no rounds. Rounds postings use the
          per-round "Interview" section + Selection ledger above (one system, no duplicate score). */}
      {rating && roundsMeta.length === 0 && (
        <Section title="Interview result">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-slate-600">Human rating</span>
            <span className="text-right"><span className="text-xl font-bold text-emerald-700">{rating.human_overall}</span><span className="text-[11px] text-slate-400">/100</span> · <span className="text-[12px] font-medium text-slate-700">{REC[rating.overall_recommendation ?? ""] ?? rating.overall_recommendation}</span></span>
          </div>
          {rating.notes && <p className="text-[12px] text-slate-500 mt-2"><span className="font-medium">Notes:</span> {rating.notes}</p>}
        </Section>
      )}

      <p className="text-[11px] text-slate-400 text-center">Advisory — the AI score guides the human. Advancing, rejecting, and hiring are human decisions.</p>
    </main>
  );
}
