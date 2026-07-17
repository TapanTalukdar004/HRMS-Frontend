/**
 * EmployeePrAnalysis (server) — builds the per-PR analysis feed for one engineer from the report we
 * already computed (no extra scoring pass), loads the repo's CodeGraph module map, and hands both to the
 * interactive client. Each PR: the reviewer's review (quality / covers / defects / strengths / narrative),
 * whether it matches the ticket it claims, blast radius, and the modules it touched — click → light the map.
 */
import type { EmployeeReport } from "@/lib/realReport";
import { REAL_REPO } from "@/lib/realReport";
import { readTrialGraph } from "@/lib/trialQueries";
import PrAnalysisClient, { type PrAnalysis } from "./PrAnalysisClient";

export default function EmployeePrAnalysis({ report }: { report: EmployeeReport }) {
  // flatten proven issues → one row per merged PR (a PR can back several issues → collect all its keys)
  const byPr = new Map<number, PrAnalysis>();
  for (const s of report.provenIssues) {
    for (const pp of s.prs) {
      if (!pp.merged) continue;
      const n = pp.pr.pr_number;
      const existing = byPr.get(n);
      if (existing) {
        if (!existing.issueKeys.includes(s.issue.issue_key)) {
          existing.issueKeys.push(s.issue.issue_key);
          existing.issueTitles.push(s.issue.title ?? s.issue.issue_key);
        }
        continue; // PR already captured under another issue
      }
      byPr.set(n, {
        pr_number: n,
        title: pp.pr.title,
        issueKeys: [s.issue.issue_key],
        issueTitles: [s.issue.title ?? s.issue.issue_key],
        titleMismatch: pp.flags.includes("requirement_mismatch") || pp.flags.includes("status_without_code"),
        quality: pp.quality,
        covers: pp.coversReq,
        narrative: pp.narrative,
        strengths: pp.strengths,
        defects: pp.defects,
        flags: pp.flags,
        blastBand: pp.pr.blastBand,
        reachedSymbols: pp.pr.reachedSymbols,
        touchesSensitive: pp.pr.touchesSensitive,
        changedModules: pp.pr.changedModules,
        reachedModules: pp.pr.reachedModules,
        reviews: pp.pr.reviews,
        selfMerged: pp.pr.selfMerged,
        ci: pp.pr.ci,
        adds: pp.pr.adds,
        dels: pp.pr.dels,
      });
    }
  }
  const prs = [...byPr.values()].sort((a, b) => (b.reachedSymbols ?? 0) - (a.reachedSymbols ?? 0) || b.pr_number - a.pr_number);
  const graph = readTrialGraph(REAL_REPO);
  if (prs.length === 0) return null;
  return <PrAnalysisClient prs={prs} graph={graph} repo={REAL_REPO} />;
}
