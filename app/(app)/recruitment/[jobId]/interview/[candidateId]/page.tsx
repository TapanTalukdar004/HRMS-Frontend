import Link from "next/link";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { accountFor, AUTH_COOKIE } from "@/lib/auth";
import { signedInterviewUrl } from "@/lib/interviewStorage";
import { computeLedger } from "@/lib/ledger";
import RecordingPanel from "./RecordingPanel";
import Scorecard from "./Scorecard";
import GenerateRoundButton from "./GenerateRoundButton";
import RoundScorecard from "../../RoundScorecard";

/** Interview cockpit — the ONE place a human interviewer sees the questions AND scores. For a posting with
 *  rounds it runs the CURRENT round (lowest unrated): its pointed questions + a per-round scorecard →
 *  interview_round_ratings. Each round's questions are generated lazily (a button here), only when HR gets
 *  to that round. No-rounds postings keep the original single scorecard. HR-only. Advisory: nothing
 *  advances/rejects here — the decision (offer/hire) is on the candidate profile. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Cand = { id: string; job_post_id: string; name: string; stage: string; consent_recording: boolean };
type Job = { id: string; title: string; level: string | null };
type PrepQ = { question: string; expected_answer?: string; strong_answer?: string };
type PrepArea = { area: string; rationale?: string; questions: PrepQ[] };
type Round = { seq: number; name: string; round_type: string; weight: number };
type RoundPrep = { round_seq: number; questions: { focus_areas?: PrepArea[] } | null };
type RoundRating = { round_seq: number; round_score_0_100: number | null; verdict: string | null; notes: string | null; competency_scores: { label?: string; rating?: number | null; not_assessed?: boolean }[] | null };
type Comp = { key: string; label: string; guide: string; focus: boolean };
type Rating = { competencies: { key: string; label: string; rating: number | null; anchor_label: string | null; evidence: string; not_assessed: boolean }[]; overall_recommendation: string | null; human_overall: number | null; notes: string | null; human_rated_at: string };

const REC: Record<string, string> = { strong_yes: "strong yes", yes: "yes", no: "no", strong_no: "strong no" };

export default async function InterviewCockpit({ params }: { params: Promise<{ jobId: string; candidateId: string }> }) {
  const { jobId, candidateId } = await params;
  const acct = accountFor((await cookies()).get(AUTH_COOKIE)?.value);
  if (!acct || acct.role !== "hr") {
    return <main className="max-w-3xl mx-auto px-4 py-6 pt-20 md:pt-6"><div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-500">The interview cockpit is available to HR only.</div></main>;
  }

  let cand: Cand | null = null;
  let job: Job | null = null;
  let rounds: Round[] = [];
  let roundPreps: RoundPrep[] = [];
  let roundRatings: RoundRating[] = [];
  let screeningScore: number | null = null;
  let phaseWeights: { screening?: number; rounds?: number } | null = null;
  // no-rounds fallback state
  let comps: Comp[] = [];
  let rating: Rating | null = null;
  let recUrl: string | null = null;
  try {
    cand = (await q<Cand>("SELECT id, job_post_id, name, stage, consent_recording FROM candidates WHERE id = $1::uuid AND job_post_id = $2", [candidateId, jobId]))[0] ?? null;
    if (cand) {
      job = (await q<Job>("SELECT id, title, level FROM job_posts WHERE id = $1", [jobId]))[0] ?? null;
      rounds = await q<Round>("SELECT seq, name, round_type, weight::float8 AS weight FROM job_rounds WHERE job_post_id = $1 ORDER BY seq", [jobId]);
      screeningScore = (await q<{ overall_score: number | null }>("SELECT overall_score::float8 AS overall_score FROM screenings WHERE candidate_id = $1::uuid", [candidateId]))[0]?.overall_score ?? null;
      phaseWeights = (await q<{ phase_weights: { screening?: number; rounds?: number } | null }>("SELECT phase_weights FROM job_rubrics WHERE job_post_id = $1 ORDER BY version DESC LIMIT 1", [jobId]))[0]?.phase_weights ?? null;
      if (rounds.length > 0) {
        roundPreps = await q<RoundPrep>("SELECT round_seq, questions FROM interview_round_prep WHERE candidate_id = $1::uuid ORDER BY round_seq", [candidateId]);
        roundRatings = await q<RoundRating>("SELECT round_seq, round_score_0_100::float8 AS round_score_0_100, verdict, notes, competency_scores FROM interview_round_ratings WHERE candidate_id = $1::uuid ORDER BY round_seq", [candidateId]);
      } else {
        const prep = (await q<{ questions: { focus_areas?: PrepArea[] } | null }>("SELECT questions FROM interview_prep WHERE candidate_id = $1::uuid", [candidateId]))[0]?.questions ?? null;
        const areas = prep?.focus_areas ?? [];
        comps = areas.length > 0
          ? areas.map((a, i) => ({ key: `c${i}`, label: a.area, guide: a.rationale || "", focus: i < 2 }))
          : ((await q<{ dimensions: { key: string; label: string }[] }>("SELECT dimensions FROM job_rubrics WHERE job_post_id = $1 ORDER BY version DESC LIMIT 1", [jobId]))[0]?.dimensions ?? []).map((d, i) => ({ key: d.key, label: d.label, guide: "", focus: i < 2 }));
        rating = (await q<Rating>("SELECT competencies, overall_recommendation, human_overall::float8 AS human_overall, notes, human_rated_at FROM interview_human_ratings WHERE candidate_id = $1::uuid", [candidateId]))[0] ?? null;
        const rec = (await q<{ storage_path: string }>("SELECT storage_path FROM interview_recordings WHERE candidate_id = $1::uuid ORDER BY uploaded_at DESC LIMIT 1", [candidateId]))[0];
        if (rec) recUrl = await signedInterviewUrl(rec.storage_path);
      }
    }
  } catch { /* invalid uuid */ }

  if (!cand || !job) {
    return <main className="max-w-3xl mx-auto px-4 py-6 pt-20 md:pt-6"><Link href={`/recruitment/${jobId}`} className="text-[13px] text-[#AE00D0] hover:underline">← Back</Link><div className="mt-6 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">Candidate not found for this job.</div></main>;
  }

  const Header = (
    <>
      <Link href={`/recruitment/${jobId}/candidate/${cand.id}`} className="text-[13px] text-[#AE00D0] hover:underline">← {cand.name} · profile</Link>
      <div className="mt-2 mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Interview · {cand.name}</h1>
        <div className="text-[13px] text-slate-500 mt-1">{job.title} · {job.level ?? "—"} · score behavior against the frozen rubric — advisory, a human decides.</div>
      </div>
    </>
  );

  // ── Rounds cockpit ──────────────────────────────────────────────────────────
  if (rounds.length > 0) {
    const prepBySeq = Object.fromEntries(roundPreps.map((p) => [p.round_seq, p]));
    const ratingBySeq = Object.fromEntries(roundRatings.map((r) => [r.round_seq, r]));
    const current = rounds.find((r) => !(r.seq in ratingBySeq)) ?? null;
    const ledger = computeLedger({
      screeningScore, phaseWeights,
      rounds: rounds.map((r) => ({ seq: r.seq, name: r.name, weight: r.weight, score: ratingBySeq[r.seq]?.round_score_0_100 ?? null })),
    });
    const curPrep = current ? prepBySeq[current.seq]?.questions?.focus_areas ?? null : null;

    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-6 pt-20 md:pt-6">
        {Header}

        {/* Rounds progress strip */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {rounds.map((r) => {
            const rated = ratingBySeq[r.seq];
            const isCur = current?.seq === r.seq;
            return (
              <span key={r.seq} className={`text-[12px] rounded-full px-2.5 py-1 ${rated ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : isCur ? "bg-[#AE00D0] text-white" : "bg-stone-100 text-slate-500"}`}>
                {r.seq}. {r.name}{rated ? ` · ${rated.round_score_0_100}/100` : isCur ? " · now" : ""}
              </span>
            );
          })}
        </div>

        {/* Ledger */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 mb-4">
          <div className="flex items-center gap-2 mb-1"><span className="text-[13px] font-semibold text-slate-800">Overall</span>{ledger.overall != null ? <span className="text-[13px] font-bold text-slate-900">{ledger.overall}/100</span> : <span className="text-[12px] text-amber-600">{ledger.ratedRounds}/{ledger.totalRounds} rounds rated</span>}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-slate-500">
            {ledger.rows.map((row) => <span key={row.key}>{row.label} <b className="text-slate-700">{row.overallWeight}%</b>{row.score != null ? ` · ${row.score}` : ""}</span>)}
          </div>
        </div>

        {current ? (
          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[15px] font-semibold text-slate-800">Round {current.seq}: {current.name}</h2>
              <span className="text-[11px] text-slate-400">{current.round_type.replace(/_/g, " ")}</span>
            </div>

            {!curPrep ? (
              <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-5 text-center">
                <p className="text-[13px] text-slate-600 mb-3">No questions generated for this round yet. Generate them when you're ready to run it — only this round is generated, so you don't spend on rounds a candidate never reaches.</p>
                <div className="flex justify-center"><GenerateRoundButton candidateId={cand.id} roundSeq={current.seq} roundName={`Round ${current.seq}`} /></div>
              </div>
            ) : (
              <>
                {/* Questions — clean, pointed */}
                <div className="space-y-4">
                  {curPrep.map((a, ai) => (
                    <div key={ai}>
                      <div className="text-[13px] font-semibold text-slate-700 mb-1.5">{a.area}</div>
                      <ol className="space-y-2 list-decimal pl-5 marker:text-slate-400">
                        {a.questions.map((qq, qi) => (
                          <li key={qi} className="text-[14px] text-slate-800">
                            {qq.question}
                            {(qq.expected_answer || qq.strong_answer) && <div className="text-[12.5px] text-emerald-700 mt-0.5">Good answer: {qq.expected_answer || qq.strong_answer}</div>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
                {/* Scoring — the ONLY scorecard, here on the interview page */}
                <div className="mt-4 border-t border-stone-100 pt-3">
                  <RoundScorecard candidateId={cand.id} roundSeq={current.seq} competencies={curPrep.map((a, i) => ({ key: `fa-${i}`, label: a.area }))} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 text-center">
            <div className="text-[15px] font-semibold text-emerald-800">All rounds scored ✓</div>
            <p className="text-[13px] text-slate-600 mt-1">Overall {ledger.overall}/100. Make the hire decision (offer / reject) from the <Link href={`/recruitment/${jobId}/candidate/${cand.id}`} className="text-[#AE00D0] hover:underline">candidate profile</Link>.</p>
          </div>
        )}

        {/* Completed rounds — short summary only (score + verdict + notes) */}
        {roundRatings.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">completed rounds</div>
            {rounds.filter((r) => ratingBySeq[r.seq]).map((r) => {
              const rr = ratingBySeq[r.seq];
              return (
                <div key={r.seq} className="rounded-xl border border-stone-200 bg-white px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-slate-700">Round {r.seq}: {r.name}</span>
                    <span className="text-[12.5px] font-semibold text-emerald-700">{rr.round_score_0_100}/100 · {REC[rr.verdict ?? ""] ?? rr.verdict}</span>
                  </div>
                  {rr.notes && <p className="text-[12px] text-slate-500 mt-1">{rr.notes}</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* Optional audio recording */}
        <details className="mt-4 rounded-xl border border-stone-200 bg-white overflow-hidden">
          <summary className="px-4 py-2.5 cursor-pointer list-none text-[13px] text-slate-600 hover:bg-stone-50">▸ Record audio (optional)</summary>
          <div className="px-4 py-3 border-t border-stone-100">
            <RecordingPanel candidateId={cand.id} competencies={curPrep ? curPrep.map((a, i) => ({ key: `fa-${i}`, label: a.area, guide: "", focus: false })) : []} candidateConsented={cand.consent_recording} hasRecording={false} />
          </div>
        </details>
      </main>
    );
  }

  // ── No-rounds fallback: original single scorecard ────────────────────────────
  const locked = !!rating;
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-6 pt-20 md:pt-6">
      {Header}
      {locked ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-700">Rating locked{rating!.human_rated_at ? ` on ${new Date(rating!.human_rated_at).toLocaleString()}` : ""}.</div>
            <div className="text-right"><div className="text-2xl font-bold text-emerald-700 leading-none">{rating!.human_overall}<span className="text-[11px] text-slate-400">/100</span></div><div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{REC[rating!.overall_recommendation ?? ""] ?? rating!.overall_recommendation}</div></div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <RecordingPanel candidateId={cand.id} competencies={comps} candidateConsented={cand.consent_recording} hasRecording={!!recUrl} />
          <Scorecard candidateId={cand.id} competencies={comps} />
        </div>
      )}
    </main>
  );
}
