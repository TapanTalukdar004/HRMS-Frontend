import type { UntrackedPr } from "@/lib/realReport";

/**
 * Self-service linkage loop (changes/241): every PR the employee shipped (current + previous cycle,
 * across ALL collected repos) that has NO working issue link — with the exact fix in the header. When
 * they add the issue key to the PR title/branch, the next nightly run re-collects the rename, links it,
 * and scores it into the cycle it merged in (late-linkage thaw). Not scored until then — proof-first.
 */
const dmy = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
const shortRepo = (r: string) => r.split("/")[1] ?? r;

export default function UntrackedPrs({ items, subject }: { items: UntrackedPr[]; subject: string }) {
  if (!items.length) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-amber-900">
            PRs with no issue link ({items.length}) <span className="font-normal text-amber-700/80">· current + previous cycle · not scored</span>
          </h2>
          <span className="text-[11.5px] text-slate-500">fix: add the Linear issue ID (e.g. <code className="font-mono">AB-123</code>) to the PR title or branch — tonight&apos;s scan links &amp; scores it</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-1">
          {subject} shipped this work, but without an issue key the system can&apos;t attach it to a ticket — so it earns no points yet. Renaming the PR is enough; no re-merge needed.
        </p>
      </div>
      <div className="border-t border-amber-100 bg-white overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="text-left px-4 py-2">Repo</th>
              <th className="text-left px-3 py-2">PR</th>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-3 py-2">State</th>
              <th className="text-left px-3 py-2">Key found?</th>
              <th className="text-right px-4 py-2">Merged</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={`${p.repo}#${p.prNumber}`} className="border-t border-stone-100 hover:bg-stone-50/60">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{shortRepo(p.repo)}</td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-slate-700 whitespace-nowrap">
                  <a href={`https://github.com/${p.repo}/pull/${p.prNumber}`} target="_blank" rel="noreferrer" className="hover:text-[#6745E8] hover:underline" title="Open on GitHub to edit the title">#{p.prNumber} ↗</a>
                </td>
                <td className="px-3 py-2 text-slate-700 max-w-[300px]"><div className="truncate" title={p.title ?? ""}>{p.title ?? "—"}</div></td>
                <td className="px-3 py-2">
                  {p.mergedAt
                    ? <span className="inline-block text-[10.5px] ring-1 ring-inset rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 ring-violet-200">merged</span>
                    : <span className="inline-block text-[10.5px] ring-1 ring-inset rounded-full px-2 py-0.5 bg-sky-50 text-sky-700 ring-sky-200">open</span>}
                </td>
                <td className="px-3 py-2 text-[11.5px]">
                  {p.status === "external_key"
                    ? <span className="text-amber-700" title="A key exists but that team's issues aren't connected yet">{p.candidateKeys.slice(0, 2).join(", ")} — team not connected</span>
                    : <span className="text-slate-400">none</span>}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap text-slate-500 tabular-nums">{dmy(p.mergedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
