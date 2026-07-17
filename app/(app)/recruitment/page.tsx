import Link from "next/link";
import { q } from "@/lib/db";
import { NewJobForm } from "./NewJobForm";
import ApplyLink from "./ApplyLink";

/** HR recruitment home (behind the app login). Shows the hiring pipeline the system runs, a funnel KPI band,
 *  and each posting as a card with its applicant→screened→shortlisted→interviewed funnel. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Recruitment · HR Bot" };

type JobRow = {
  id: string; title: string; level: string | null; department: string | null; openings: number | null;
  is_published: boolean; created_at: string;
  applicants: number; screened: number; shortlisted: number; interviewed: number;
};

const PIPELINE: { label: string; sub: string; c: string }[] = [
  { label: "Post JD", sub: "branded role", c: "#12125c" },
  { label: "Apply", sub: "public link", c: "#AE00D0" },
  { label: "AI screen", sub: "resume → score", c: "#7B5AFF" },
  { label: "Shortlist", sub: "you decide", c: "#6745E8" },
  { label: "Prep", sub: "interview questions", c: "#378ADD" },
  { label: "Interview", sub: "cockpit + record", c: "#0891B2" },
  { label: "Score", sub: "combined", c: "#1D9E75" },
];

export default async function RecruitmentPage() {
  const jobs = await q<JobRow>(
    `SELECT j.id, j.title, j.level, j.department, j.openings, j.is_published, j.created_at,
            COUNT(DISTINCT c.id)::int AS applicants,
            COUNT(DISTINCT s.candidate_id)::int AS screened,
            (COUNT(DISTINCT c.id) FILTER (WHERE c.stage = 'shortlisted'))::int AS shortlisted,
            COUNT(DISTINCT hr.candidate_id)::int AS interviewed
       FROM job_posts j
       LEFT JOIN candidates c            ON c.job_post_id = j.id
       LEFT JOIN screenings s            ON s.candidate_id = c.id
       LEFT JOIN interview_human_ratings hr ON hr.candidate_id = c.id
      GROUP BY j.id
      ORDER BY j.created_at DESC`,
  ).catch(() => [] as JobRow[]);

  const openRoles = jobs.filter((j) => j.is_published).length;
  const sum = (k: keyof JobRow) => jobs.reduce((n, j) => n + (Number(j[k]) || 0), 0);
  const totals = { applicants: sum("applicants"), screened: sum("screened"), shortlisted: sum("shortlisted"), interviewed: sum("interviewed") };

  const funnel = (j: JobRow) => [
    { k: "Applicants", v: j.applicants, c: "#AE00D0" },
    { k: "Screened", v: j.screened, c: "#7B5AFF" },
    { k: "Shortlisted", v: j.shortlisted, c: "#6745E8" },
    { k: "Interviewed", v: j.interviewed, c: "#1D9E75" },
  ];

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 pt-20 md:pt-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Recruitment</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">Post a role, share its public link, and let the pipeline screen, shortlist, prep, and interview — you make every call.</p>
        </div>
        <NewJobForm />
      </div>

      {/* Pipeline the system runs */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-4">How hiring flows through the system</div>
        <ol className="flex items-start justify-between gap-1 overflow-x-auto">
          {PIPELINE.map((s, i) => (
            <li key={s.label} className="flex items-start gap-1 shrink-0">
              <div className="flex flex-col items-center text-center w-[74px]">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold" style={{ background: s.c }}>{i + 1}</span>
                <span className="mt-1.5 text-[12px] font-medium text-slate-700 leading-tight">{s.label}</span>
                <span className="text-[10px] text-slate-400 leading-tight">{s.sub}</span>
              </div>
              {i < PIPELINE.length - 1 && <span className="mt-4 text-slate-300 hidden sm:block">→</span>}
            </li>
          ))}
        </ol>
      </div>

      {/* Funnel KPI band */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Open roles", v: openRoles, c: "#12125c" },
          { label: "Applicants", v: totals.applicants, c: "#AE00D0" },
          { label: "Screened", v: totals.screened, c: "#7B5AFF" },
          { label: "Shortlisted", v: totals.shortlisted, c: "#6745E8" },
          { label: "Interviewed", v: totals.interviewed, c: "#1D9E75" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: t.c }} /><span className="text-[11px] uppercase tracking-wider text-slate-500">{t.label}</span></div>
            <div className="text-3xl font-bold tabular-nums mt-2 text-slate-900">{t.v}</div>
          </div>
        ))}
      </div>

      {/* Postings */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Job postings <span className="text-slate-300 normal-case tracking-normal">· {jobs.length}</span></h2>
        </div>
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-14 text-center text-slate-400 text-sm">No postings yet — click <b>New job posting</b> to create your first role.</div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-2xl border border-stone-200 bg-white overflow-hidden transition hover:shadow-md hover:border-stone-300">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/recruitment/${j.id}`} className="text-lg font-semibold text-slate-900 hover:text-[#AE00D0] leading-none">{j.title}</Link>
                        {j.is_published
                          ? <span className="text-[10px] uppercase tracking-wide rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 px-2 py-0.5">open</span>
                          : <span className="text-[10px] uppercase tracking-wide rounded-full bg-stone-100 text-slate-500 px-2 py-0.5">closed</span>}
                      </div>
                      <div className="text-[12.5px] text-slate-500 mt-1">{[j.level, j.department, j.openings ? `${j.openings} opening${j.openings === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <Link href={`/recruitment/${j.id}`} className="shrink-0 text-[13px] font-medium rounded-lg bg-[#AE00D0] text-white px-4 py-2 hover:bg-[#9100ad]">Open →</Link>
                  </div>

                  {/* Funnel */}
                  <div className="mt-4 flex items-center gap-2 sm:gap-4 flex-wrap">
                    {funnel(j).map((f, i) => (
                      <div key={f.k} className="flex items-center gap-2 sm:gap-4">
                        <div className="text-center">
                          <div className="text-xl font-bold tabular-nums" style={{ color: f.v > 0 ? f.c : "#cbd5e1" }}>{f.v}</div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">{f.k}</div>
                        </div>
                        {i < 3 && <span className="text-slate-300">›</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-2.5 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between text-[12px] flex-wrap gap-2">
                  <span className="text-slate-500 inline-flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 min-w-0">Apply link: <ApplyLink jobId={j.id} compact /></span>
                    <a href={`/apply/${j.id}`} target="_blank" rel="noreferrer" className="text-[#8b27ff] hover:underline shrink-0">view JD ↗</a>
                    <a href={`/api/jobs/${j.id}/jd`} target="_blank" rel="noreferrer" className="text-[#8b27ff] hover:underline shrink-0">JD PDF ↓</a>
                  </span>
                  <span className="text-slate-400 shrink-0">created {new Date(j.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
