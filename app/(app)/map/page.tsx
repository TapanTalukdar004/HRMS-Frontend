import { getIssueGraph } from "@/lib/queries";
import { IssueMap } from "@/components/IssueMap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Issue Map · HR Bot" };

export default async function IssueMapPage() {
  const graph = await getIssueGraph();

  const nBugs = graph ? graph.issues.filter((i) => (i.issue_type ?? "").toLowerCase() === "bug").length : 0;
  const nLinked = graph ? graph.issues.filter((i) => i.is_bug_of || i.parent_issue_id).length : 0;

  return (
    <main className="px-4 sm:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Issue Map</h1>
          <p className="text-sm text-slate-500 mt-1">
            How work connects — each feature with its linked bugs / sub-issues. The map grows
            as new reports relate more issues together.
          </p>
        </div>
        {graph && (
          <div className="text-[12px] text-slate-500 text-right">
            <div><b className="text-slate-700">{graph.team}</b> · {graph.cycle_name}</div>
            <div className="tabular-nums">
              {graph.issues.length} issues · {nBugs} bugs · {nLinked} linked
              {graph.snapshot_at && <> · {new Date(graph.snapshot_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</>}
            </div>
          </div>
        )}
      </div>

      {!graph || graph.issues.length === 0 ? (
        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-10 text-center text-slate-400">
          No issue data yet. Run the daily Linear ingest to populate the map.
        </div>
      ) : (
        <div className="mt-4">
          <IssueMap issues={graph.issues} />
        </div>
      )}
    </main>
  );
}
