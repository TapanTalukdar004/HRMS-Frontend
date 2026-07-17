import { q } from "@/lib/db";
import { ApplyForm } from "./ApplyForm";
import BrandedJD from "./BrandedJD";
import { JD_COLUMNS, type JobJDRow } from "@/lib/jdData";

/**
 * PUBLIC apply page — /apply/<jobId>. Outside the (app) group, and excluded from the login gate in
 * middleware.ts, so candidates need no account. Renders the RUH-branded company-format JD (BrandedJD)
 * above the form, plus a link to download the same JD as a branded PDF. The only public write is POST /api/apply.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Apply · RUH AI" };

type JobRow = JobJDRow & { is_published: boolean; apply_questions: unknown };

async function getJob(jobId: string): Promise<JobRow | null> {
  try {
    const rows = await q<JobRow>(`SELECT ${JD_COLUMNS}, is_published, apply_questions FROM job_posts WHERE id = $1`, [jobId]);
    return rows[0] ?? null;
  } catch {
    return null; // invalid UUID etc.
  }
}

export default async function ApplyPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  const monthYear = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf7ff] via-white to-[#f3e8ff] px-4 py-10">
      <div className="max-w-3xl mx-auto">
        {!job || !job.is_published ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
            <div className="flex items-baseline justify-center gap-1.5 mb-4">
              <span className="text-2xl font-extrabold text-[#12125c]">RUH</span>
              <span className="text-2xl font-extrabold text-[#8b27ff]">AI</span>
            </div>
            <h1 className="text-lg font-semibold text-slate-900">This role isn&apos;t open</h1>
            <p className="mt-2 text-sm text-slate-500">
              The job posting you&apos;re looking for was not found or has been closed. Please check the
              link, or visit <a className="text-[#AE00D0] underline" href="https://www.ruh.ai/career">ruh.ai/career</a>.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-stone-200 bg-white p-7 sm:p-9 shadow-sm relative">
              <a href={`/api/jobs/${job.id}/jd`} target="_blank" rel="noreferrer"
                 className="absolute top-6 right-6 text-[12px] font-medium rounded-lg border border-[#8b27ff]/30 text-[#8b27ff] px-3 py-1.5 hover:bg-[#f5f5ff]">
                ↓ Download detailed JD (PDF)
              </a>
              <BrandedJD row={job} monthYear={monthYear} />
            </div>

            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Apply for this role</h2>
              <p className="text-[13px] text-slate-500 mb-4">Takes two minutes. A human makes every hiring decision.</p>
              <ApplyForm
                jobId={job.id}
                jobTitle={job.title}
                applyQuestions={Array.isArray(job.apply_questions) ? job.apply_questions.map((x) => String(x)).filter(Boolean) : []}
              />
            </div>
          </>
        )}

        <p className="mt-4 text-center text-[11px] text-slate-400">
          RUH AI is an equal-opportunity employer. Your application is reviewed with AI assistance; a
          human makes every hiring decision.
        </p>
      </div>
    </main>
  );
}
