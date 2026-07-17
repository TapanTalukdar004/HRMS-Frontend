import type { CarryoverIssue } from "@/lib/realReport";

/**
 * Ongoing assigned work with no merged PR yet — the person's live plate (changes/206, restyled 210).
 * Shown as regular issues with their own fields (status/priority/SP/assigned date), NOT labelled by
 * cycle of origin. Only used as the fallback when there's no scored EngineerCard to fold these into;
 * when there IS one, they merge into its "Assigned" list. Not scored this cycle (proof-first). Collapsible.
 */
const dmy = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
export default function CarryoverSection({ items, name }: { items: CarryoverIssue[]; name: string }) {
  if (!items.length) return null;
  return (
    <details className="rounded-xl border border-stone-200 bg-stone-50/40">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">
        Assigned — no merged PR yet
        <span className="ml-2 text-[11px] font-normal text-slate-400">· {items.length} open item{items.length !== 1 ? "s" : ""} {name} still {name === "you" ? "own" : "owns"} · not scored this cycle</span>
      </summary>
      <div className="border-t border-stone-100 px-4 py-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
            <th className="py-1.5 pr-3 font-medium">Ticket</th><th className="py-1.5 pr-3 font-medium">Title</th>
            <th className="py-1.5 pr-3 font-medium">Status</th><th className="py-1.5 pr-3 font-medium">Priority</th>
            <th className="py-1.5 pr-3 font-medium">SP</th><th className="py-1.5 font-medium">Assigned</th>
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.issueKey} className="border-t border-stone-100 align-top">
                <td className="py-1.5 pr-3 font-mono text-[12px] text-slate-700 whitespace-nowrap">{i.issueKey}</td>
                <td className="py-1.5 pr-3 text-slate-700 max-w-[26rem] truncate">{i.title ?? "—"}</td>
                <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{i.status ?? "—"}</td>
                <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{i.priority ?? "—"}</td>
                <td className="py-1.5 pr-3 text-slate-500 tabular-nums">{i.estimate ?? "—"}</td>
                <td className="py-1.5 text-slate-400 tabular-nums whitespace-nowrap">{dmy(i.assignedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-2">Open tickets still assigned to {name} with no merged PR yet — shown so ongoing work stays visible. They score in whichever cycle they ship.</p>
      </div>
    </details>
  );
}
