import Link from "next/link";
import { q } from "@/lib/db";
import { signedResumeUrl } from "@/lib/resumeStorage";
import CandidateBoard, { type CandidateVM } from "./CandidateBoard";
import ScreenAllButton from "./ScreenAllButton";
import ApplyLink from "../ApplyLink";
import { computeLedger } from "@/lib/ledger";

/** Candidate list for one job (behind the app login). Shows Screening #1 (Phase 2) per candidate with
 *  proof-first quoted evidence. Resume links are short-lived SIGNED urls (private bucket). Advisory:
 *  the score informs a human; shortlisting is a human action. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Job = { id: string; title: string; level: string | null; is_published: boolean; openings: number | null };
type Cand = {
  id: string; name: string; email: string; phone: string | null;
  resume_path: string | null; resume_filename: string | null;
  stage: string; consent_ai: boolean; consent_recording: boolean; created_at: string;
  screen_status: string | null; screen_error: string | null;
};
type RubricDim = { key: string; label: string; weight: number };
type RubricRow = { version: number; level: string | null; dimensions: RubricDim[]; must_haves: string[]; authored_by: string | null; phase_weights: { screening?: number; rounds?: number } | null };
type RoundRow = { seq: number; name: string; round_type: string; weight: number; focus_prompt: string | null };
type ScreenDim = { key: string; label: string; weight: number; score: number; quoted_evidence_line: string; evidence_verified: boolean; note: string };
type Screen = {
  candidate_id: string; overall_score: number | null; verdict_label: string | null;
  detail: {
    dimensions?: ScreenDim[]; matched_skills?: string[]; missing_skills?: string[];
    strengths?: string[]; concerns?: string[]; tldr?: string; summary?: string; evidence_verified?: string;
    claims?: { claim: string; category: string; evidence_strength: "demonstrated" | "listed_only" | "absent"; firsthand_signal: "firsthand_owned" | "team_or_observed" | "ambiguous"; status: "supported" | "unsupported" | "contradicted"; resume_locus: string; verify_note: string }[];
    verification_summary?: { demonstrated_count?: number; listed_only_count?: number; absent_count?: number; top_claims_to_verify?: string[] };
    injection_flags?: { detected: boolean; stripped: number; reasons: string[] };
    must_haves?: { requirement: string; met: boolean; evidence_line: string }[];
    scan_limited?: boolean; extraction_method?: string;
  } | null;
};
type PrepQ = { question: string; strong_answer: string; weak_answer: string };
type PrepArea = { area: string; rationale: string; questions: PrepQ[] };
type Prep = { candidate_id: string; questions: { focus_areas?: PrepArea[]; summary?: string } | null; generated_at: string };

export default async function JobCandidatesPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let job: Job | null = null;
  let cands: Cand[] = [];
  let rubric: RubricRow | null = null;
  let rounds: RoundRow[] = [];
  let screens: Record<string, Screen> = {};
  let preps: Record<string, Prep> = {};
  let ivs: Record<string, { human_overall: number | null; overall_recommendation: string | null }> = {};
  let jobRounds: { seq: number; name: string; weight: number }[] = [];
  let roundRatingsByCand: Record<string, Record<number, number | null>> = {};
  try {
    job = (await q<Job>("SELECT id, title, level, is_published, openings FROM job_posts WHERE id = $1", [jobId]))[0] ?? null;
    if (job) {
      cands = await q<Cand>(
        `SELECT id, name, email, phone, resume_path, resume_filename, stage,
                consent_ai, consent_recording, created_at, screen_status, screen_error
           FROM candidates WHERE job_post_id = $1`,
        [jobId],
      );
      rubric = (await q<RubricRow>(
        "SELECT version, level, dimensions, must_haves, authored_by, phase_weights FROM job_rubrics WHERE job_post_id = $1 ORDER BY version DESC LIMIT 1",
        [jobId],
      ))[0] ?? null;
      rounds = await q<RoundRow>(
        "SELECT seq, name, round_type, weight::float8 AS weight, focus_prompt FROM job_rounds WHERE job_post_id = $1 ORDER BY seq",
        [jobId],
      );
      const srows = await q<Screen & { shortlisted: boolean }>(
        "SELECT candidate_id, overall_score::float8 AS overall_score, verdict_label, shortlisted, detail FROM screenings WHERE job_post_id = $1",
        [jobId],
      );
      screens = Object.fromEntries(srows.map((s) => [s.candidate_id, s]));
      const prows = await q<Prep>(
        "SELECT candidate_id, questions, generated_at FROM interview_prep WHERE job_post_id = $1",
        [jobId],
      );
      preps = Object.fromEntries(prows.map((p) => [p.candidate_id, p]));
      const ivrows = await q<{ candidate_id: string; human_overall: number | null; overall_recommendation: string | null }>(
        "SELECT candidate_id, human_overall::float8 AS human_overall, overall_recommendation FROM interview_human_ratings WHERE job_post_id = $1",
        [jobId],
      );
      ivs = Object.fromEntries(ivrows.map((r) => [r.candidate_id, r]));
      jobRounds = await q<{ seq: number; name: string; weight: number }>(
        "SELECT seq, name, weight::float8 AS weight FROM job_rounds WHERE job_post_id = $1 ORDER BY seq", [jobId]);
      if (jobRounds.length > 0) {
        const rr = await q<{ candidate_id: string; round_seq: number; round_score_0_100: number | null }>(
          "SELECT candidate_id, round_seq, round_score_0_100::float8 AS round_score_0_100 FROM interview_round_ratings WHERE job_post_id = $1", [jobId]);
        for (const row of rr) { (roundRatingsByCand[row.candidate_id] ??= {})[row.round_seq] = row.round_score_0_100; }
      }
    }
  } catch { /* invalid uuid → job stays null */ }

  // sort: screened (by score desc) first, then unscreened by applied order
  cands.sort((a, b) => {
    const sa = screens[a.id]?.overall_score ?? -1;
    const sb = screens[b.id]?.overall_score ?? -1;
    return sb - sa;
  });
  const links = await Promise.all(cands.map((c) => (c.resume_path ? signedResumeUrl(c.resume_path) : Promise.resolve(null))));
  const screenedCount = Object.keys(screens).length;

  // ── ADVISORY shortlist recommendation (a human still clicks Advance — this never changes state).
  // Rule: must-haves gate → quality bar (score ≥ 55, "Potential Fit"+) → cap ≈ 5× openings → tie-band
  // (±5 pts of the cutoff, so a near-tie isn't cut arbitrarily).
  const BAR = 55;
  const cap = Math.max(1, (job?.openings ?? 1)) * 5;
  const mustHavesMet = (s: Screen | undefined): boolean => {
    const mh = s?.detail?.must_haves ?? [];
    return mh.every((m) => m.met); // vacuously true when none recorded
  };
  const eligible = cands
    .filter((c) => {
      const s = screens[c.id];
      return s && (s.overall_score ?? 0) >= BAR && mustHavesMet(s);
    })
    .sort((a, b) => (screens[b.id]?.overall_score ?? 0) - (screens[a.id]?.overall_score ?? 0));
  const cutoff = eligible.length > cap ? (screens[eligible[cap - 1].id]?.overall_score ?? 0) : 0;
  const recommended = new Set(
    eligible.filter((c, i) => i < cap || (screens[c.id]?.overall_score ?? 0) >= cutoff - 5).map((c) => c.id),
  );
  const shortlistedCount = cands.filter((c) => c.stage === "shortlisted").length;
  const interviewedCount = jobRounds.length > 0
    ? cands.filter((c) => jobRounds.every((jr) => (roundRatingsByCand[c.id]?.[jr.seq] ?? null) != null)).length
    : Object.keys(ivs).length;

  // view-models for the interactive board (all per-candidate signal computed server-side)
  const board: CandidateVM[] = cands.map((c, i) => {
    const s = screens[c.id];
    const d = s?.detail ?? null;
    const matched = d?.matched_skills ?? [];
    const missing = d?.missing_skills ?? [];
    const total = matched.length + missing.length;
    const iv = ivs[c.id];
    const p = preps[c.id];
    return {
      id: c.id, name: c.name, email: c.email, phone: c.phone, createdAt: c.created_at,
      stage: c.stage, resumeUrl: links[i] ?? null,
      score: s?.overall_score ?? null, verdict: s?.verdict_label ?? null,
      skillMatchPct: total > 0 ? Math.round((matched.length / total) * 100) : null,
      dimensions: (d?.dimensions ?? []).map((dim) => ({
        key: dim.key, label: dim.label, weight: dim.weight, score: dim.score,
        quoted_evidence_line: dim.quoted_evidence_line, evidence_verified: dim.evidence_verified,
      })),
      matched, missing,
      claims: (d?.claims ?? []).map((cl) => ({ claim: cl.claim, evidence_strength: cl.evidence_strength, firsthand_signal: cl.firsthand_signal, status: cl.status, verify_note: cl.verify_note })),
      verifyCounts: d?.verification_summary ? { demonstrated: d.verification_summary.demonstrated_count ?? 0, listed_only: d.verification_summary.listed_only_count ?? 0, absent: d.verification_summary.absent_count ?? 0 } : null,
      toVerify: d?.verification_summary?.top_claims_to_verify ?? [],
      mustHaves: (d?.must_haves ?? []).map((m) => ({ requirement: m.requirement, met: m.met })),
      tldr: d?.tldr ?? null,
      strengths: d?.strengths ?? [], concerns: d?.concerns ?? [], summary: d?.summary ?? null,
      evidenceVerified: d?.evidence_verified ?? null, extractionMethod: d?.extraction_method ?? null,
      injectionStripped: d?.injection_flags?.detected ? (d.injection_flags.stripped ?? 0) : null,
      scanLimited: !!d?.scan_limited, recommended: recommended.has(c.id),
      screenStatus: c.screen_status ?? null, screenError: c.screen_error ?? null,
      interview: jobRounds.length > 0
        ? (() => {
            const rmap = roundRatingsByCand[c.id] ?? {};
            const led = computeLedger({ screeningScore: s?.overall_score ?? null, phaseWeights: rubric?.phase_weights ?? null, rounds: jobRounds.map((jr) => ({ seq: jr.seq, name: jr.name, weight: jr.weight, score: rmap[jr.seq] ?? null })) });
            return led.complete ? { humanOverall: led.overall, recommendation: null } : null;
          })()
        : (iv ? { humanOverall: iv.human_overall, recommendation: iv.overall_recommendation } : null),
      prep: p?.questions?.focus_areas?.length ? { summary: p.questions.summary ?? null, focusAreas: p.questions.focus_areas } : null,
    };
  });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 pt-20 md:pt-6">
      <Link href="/recruitment" className="text-[13px] text-[#AE00D0] hover:underline">← All postings</Link>
      {!job ? (
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">Job not found.</div>
      ) : (
        <>
          <div className="mt-2 mb-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{job.title}</h1>
                  {job.is_published
                    ? <span className="text-[10px] uppercase tracking-wide rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 px-2 py-0.5">open</span>
                    : <span className="text-[10px] uppercase tracking-wide rounded-full bg-stone-100 text-slate-500 px-2 py-0.5">closed</span>}
                </div>
                <div className="text-[13px] text-slate-500 mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span>{[job.level, job.openings ? `${job.openings} opening${job.openings === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "—"}</span>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">apply link: <ApplyLink jobId={job.id} /></span>
                  <span className="text-slate-300">·</span>
                  <a href={`/apply/${job.id}`} target="_blank" rel="noreferrer" className="text-[#8b27ff] hover:underline">view JD ↗</a>
                  <a href={`/api/jobs/${job.id}/jd`} target="_blank" rel="noreferrer" className="text-[#8b27ff] hover:underline">JD PDF ↓</a>
                </div>
              </div>
              {cands.length > 0 && <ScreenAllButton jobId={job.id} unscreened={cands.length - screenedCount} />}
            </div>

            {/* Funnel */}
            <div className="mt-4 flex items-center gap-3 sm:gap-5 flex-wrap">
              {([
                { k: "Applicants", v: cands.length, c: "#AE00D0" },
                { k: "Screened", v: screenedCount, c: "#7B5AFF" },
                { k: "Shortlisted", v: shortlistedCount, c: "#6745E8" },
                { k: "Interviewed", v: interviewedCount, c: "#1D9E75" },
              ] as const).map((f, i) => (
                <div key={f.k} className="flex items-center gap-3 sm:gap-5">
                  <div className="text-center">
                    <div className="text-2xl font-bold tabular-nums" style={{ color: f.v > 0 ? f.c : "#cbd5e1" }}>{f.v}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{f.k}</div>
                  </div>
                  {i < 3 && <span className="text-slate-300">›</span>}
                </div>
              ))}
            </div>
          </div>

          {rubric && (() => {
            const COLORS = ["#AE00D0", "#7B5AFF", "#12125c", "#b478ff"];
            const DESC: Record<string, string> = {
              skills: "Depth in the specific technical skills this role requires.",
              experience: "Years and relevance of hands-on experience.",
              education: "Relevant degrees, certifications, or equivalent.",
              relevance: "How well the overall background fits this exact JD.",
            };
            const desc = (k: string) => DESC[k] ?? "Contributes to the overall fit score.";
            const lvl = (rubric.level ?? "").toLowerCase();
            const calib = /senior|lead|staff|principal/.test(lvl) ? "seniority — depth & ownership weigh most"
              : /junior|entry|intern|fresher|graduate|trainee/.test(lvl) ? "entry level — fundamentals weigh more than years"
              : "mid level — skills and experience balanced";
            return (
              <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-800">How we score applicants</span>
                  <span className="text-[10px] uppercase tracking-wider bg-[#fdf0ff] text-[#AE00D0] rounded-full px-2 py-0.5">frozen · v{rubric.version}</span>
                  {rubric.authored_by === "hr_selected"
                    ? <span className="text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 rounded-full px-2 py-0.5">HR-set weights</span>
                    : <span className="text-[10px] uppercase tracking-wider text-slate-400">· level-calibrated</span>}
                  {rubric.level && <span className="text-[11px] text-slate-400">· {rubric.level}</span>}
                </div>
                <div className="flex h-6 rounded-lg overflow-hidden ring-1 ring-stone-200">
                  {rubric.dimensions.map((d, i) => (
                    <div key={d.key} title={`${d.label} — ${desc(d.key)}`}
                      style={{ width: `${d.weight}%`, background: COLORS[i % COLORS.length] }}
                      className="flex items-center justify-center text-[10px] font-semibold text-white">
                      {d.weight >= 12 ? `${d.weight}%` : ""}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {rubric.dimensions.map((d, i) => (
                    <span key={d.key} title={desc(d.key)} className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-600 cursor-help">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                      {d.label} <b className="text-slate-800">{d.weight}%</b>
                    </span>
                  ))}
                </div>
                {rubric.must_haves?.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-stone-100 text-[12px] text-slate-500">Must-haves: {rubric.must_haves.map((m) => (
                    <span key={m} className="inline-block bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 rounded px-1.5 py-0.5 mr-1 mb-1 text-[11px]">{m}</span>
                  ))}</div>
                )}
                <details className="mt-2">
                  <summary className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer list-none select-none">How scoring works ▾</summary>
                  <p className="text-[12px] text-slate-500 mt-1.5 leading-relaxed">
                    The AI scores every resume 0–100 on each area, then blends them by these weights (they sum to 100) into one advisory score{rubric.level ? <> — calibrated for <b className="text-slate-700">{rubric.level}</b> ({calib})</> : ""}. A human decides. Weights are frozen at publish (v{rubric.version}); to change them, repost at the intended level.
                    {" · "}<a href={`/api/jobs/${job.id}/jd`} target="_blank" rel="noreferrer" className="text-[#8b27ff] hover:underline">↓ branded JD (PDF)</a>
                  </p>
                </details>
              </div>
            );
          })()}

          {rounds.length > 0 && (
            <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-800">Interview rounds</span>
                <span className="text-[10px] uppercase tracking-wider bg-[#f0ecff] text-[#6745E8] rounded-full px-2 py-0.5">{rounds.length} round{rounds.length === 1 ? "" : "s"}</span>
                {rubric?.phase_weights && (
                  <span className="text-[11px] text-slate-400">· screening {rubric.phase_weights.screening ?? 0}% + rounds {rubric.phase_weights.rounds ?? 0}% of overall</span>
                )}
              </div>
              <ol className="space-y-1.5">
                {rounds.map((r) => (
                  <li key={r.seq} className="flex items-center gap-2 text-[13px]">
                    <span className="text-slate-400 shrink-0">{r.seq}.</span>
                    <span className="font-medium text-slate-800">{r.name}</span>
                    <span className="text-[11px] text-slate-400">{r.round_type.replace(/_/g, " ")}</span>
                    <span className="ml-auto text-slate-600 font-medium shrink-0">{r.weight}%</span>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-slate-400 mt-2">Each round gets AI-generated questions and its own score; the overall blends screening + rounds by the weights above. A human decides.</p>
            </div>
          )}

          {screenedCount > 0 && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
              <div className="text-[13px] text-slate-700">
                <b className="text-emerald-700">{recommended.size} recommended</b> to advance
                {" "}(passes must-haves · score ≥ {BAR} · within ~{cap} for {job.openings ?? 1} opening{(job.openings ?? 1) === 1 ? "" : "s"})
                {shortlistedCount > 0 && <> · <b>{shortlistedCount} shortlisted</b> so far</>}
              </div>
              <div className="text-[11.5px] text-slate-500 mt-0.5">
                A suggestion only — the system never advances or rejects anyone. Click <b>Advance</b> on each candidate you want to move forward; a level-calibrated interview prep sheet is prepared for everyone you shortlist.
              </div>
            </div>
          )}

          {cands.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-slate-400 text-sm">No applicants yet. Share the apply link above.</div>
          ) : (
            <CandidateBoard jobId={job.id} candidates={board} />
          )}

          <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50/50 px-4 py-3 text-[12px] text-slate-500">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">How this works</div>
            <div className="space-y-1">
              <div><b className="text-slate-600">1 · Screen</b> — applicants are scored automatically on apply; use <b>Screen unscreened</b> above to re-run a batch.</div>
              <div><b className="text-slate-600">2 · Decide</b> — you click <b>Advance</b> or <b>Reject</b>; the system only recommends, never decides.</div>
              <div><b className="text-slate-600">3 · Prep &amp; interview</b> — each shortlisted candidate gets a level-calibrated interview prep sheet; assign interviewers and run the rounds from their profile.</div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
