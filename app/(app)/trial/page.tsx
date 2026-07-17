import {
  getTrialRepo, getTrialPRs, getTrialContributors, getTrialOverview, readTrialGraph,
} from "@/lib/trialQueries";
import { TrialDashboard } from "@/components/TrialDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Codebase Trial · HR Bot" };

export default async function TrialPage() {
  const repo = await getTrialRepo();
  const [prs, contributors, overview] = await Promise.all([
    getTrialPRs(repo),
    getTrialContributors(repo),
    getTrialOverview(repo),
  ]);
  const graph = readTrialGraph(repo);

  return (
    <main className="px-4 sm:px-8 py-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Codebase trial — <span className="text-[#AE00D0]">{repo}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            A read-only trial of the CodeGraph pipeline on an open-source repo. Every merged PR is
            scored from GitHub signals + its <b>blast radius</b> in the codebase graph — no Linear.
            Click any PR to light up the modules it changed and reached.
          </p>
        </div>
        <div className="text-[12px] text-slate-500 text-right">
          <div>scored on <b className="text-slate-700">GitHub-only</b> proof × impact</div>
          <div className="tabular-nums">{overview.prs} merged PRs · {overview.sensitive} touch sensitive code</div>
        </div>
      </div>

      {prs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">
          No trial data yet. Run Phase 1–3 (collect PRs, graph_impact, trial_score) for {repo}.
        </div>
      ) : (
        <TrialDashboard repo={repo} graph={graph} prs={prs} contributors={contributors} overview={overview} />
      )}
    </main>
  );
}
