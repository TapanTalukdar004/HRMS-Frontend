import { getReviewRepos, getReviews, getReviewOverview } from "@/lib/reviewQueries";
import { readTrialGraph } from "@/lib/trialQueries";
import { q } from "@/lib/db";
import { AnalysisDashboard } from "@/components/AnalysisDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Repository Analysis · HR Bot" };

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const sp = await searchParams;
  const repos = await getReviewRepos();

  if (repos.length === 0) {
    return (
      <main className="px-4 sm:px-8 py-6 max-w-[1100px] mx-auto">
        <h1 className="text-2xl font-bold text-slate-900">Repository Analysis</h1>
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">
          No reviewed repos yet. Run agent/review_open_prs.py for a repo.
        </div>
      </main>
    );
  }

  const repo = sp.repo && repos.includes(sp.repo) ? sp.repo : repos[0];
  const [reviews, overview] = await Promise.all([getReviews(repo), getReviewOverview(repo)]);
  const graph = readTrialGraph(repo);
  const perf = await q<{ one: number }>("SELECT 1 AS one FROM pr_trial_score WHERE repo = $1 LIMIT 1", [repo]);

  return (
    <main className="px-4 sm:px-8 py-6 max-w-[1100px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          Repository Analysis — <span className="text-[#AE00D0]">{repo}</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          A professional, pre-merge review of each PR — what it does, whether it matches its title, its
          blast radius, and concrete fixes for anything that needs changing. Same format for every repo.
          Click a PR to light up its reach on the codebase map.
        </p>
      </div>
      <AnalysisDashboard repos={repos} repo={repo} reviews={reviews} overview={overview}
        graph={graph} hasPerformance={perf.length > 0} />
    </main>
  );
}
