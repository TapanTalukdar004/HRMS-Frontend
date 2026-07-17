import { getTrialPRs, getTrialContributors, getTrialOverview } from "@/lib/trialQueries";
import { MergedTable } from "@/components/MergedTable";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Performance & Ranking · HR Bot" };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const sp = await searchParams;
  const repoRows = await q<{ repo: string }>(
    "SELECT repo FROM pr_trial_score GROUP BY repo ORDER BY count(*) DESC",
  );
  const repos = repoRows.map((r) => r.repo);

  if (repos.length === 0) {
    return (
      <main className="px-4 sm:px-8 py-6 max-w-[1300px] mx-auto">
        <h1 className="text-2xl font-bold text-slate-900">Performance &amp; Ranking</h1>
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">
          No scored repos yet.
        </div>
      </main>
    );
  }

  const repo = sp.repo && repos.includes(sp.repo) ? sp.repo : repos[0];
  const [prs, contributors, overview] = await Promise.all([
    getTrialPRs(repo), getTrialContributors(repo), getTrialOverview(repo),
  ]);

  return (
    <main className="px-4 sm:px-8 py-6 max-w-[1300px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">
          Performance &amp; Ranking — <span className="text-[#AE00D0]">{repo}</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          The compensation layer: each merged PR scored (impact × proof), contributors ranked. Separate
          from the developer-facing review on the Analysis page.
        </p>
      </div>
      <MergedTable prs={prs} contributors={contributors} overview={overview} />
    </main>
  );
}
