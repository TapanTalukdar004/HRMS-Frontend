"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/** The human interviewer's structured 1–4 anchored scorecard (Phase 4a). A rating doesn't count until
 *  it has an evidence quote (proof-first); the single overall recommendation stays locked until every
 *  competency is scored (defers the global judgment → blunts halo). Submit LOCKS the rating — the AI
 *  second opinion (4b) only ever appears after this, so it can't anchor the human. */
type Comp = { key: string; label: string; guide: string; focus: boolean };
type Row = { rating: number | null; evidence: string; notAssessed: boolean };

const ANCHORS: Record<number, string> = {
  1: "1 · no evidence / red flag", 2: "2 · some evidence, real gaps",
  3: "3 · solid, clears the bar", 4: "4 · strong, clearly exceeds",
};
const OVERALL: { key: string; label: string }[] = [
  { key: "strong_no", label: "strong no" }, { key: "no", label: "no" },
  { key: "yes", label: "yes" }, { key: "strong_yes", label: "strong yes" },
];

export default function Scorecard({ candidateId, competencies }: { candidateId: string; competencies: Comp[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(competencies.map((c) => [c.key, { rating: null, evidence: "", notAssessed: false }])));
  const [overall, setOverall] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set(key: string, patch: Partial<Row>) { setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } })); }

  const done = useMemo(() => competencies.every((c) => {
    const r = rows[c.key];
    return r.notAssessed || (r.rating !== null && r.evidence.trim().length > 0);
  }), [rows, competencies]);
  const assessedCount = competencies.filter((c) => !rows[c.key].notAssessed).length;

  async function submit() {
    if (!done || !overall || submitting) return;
    setSubmitting(true); setErr(null);
    const payload = {
      competencies: competencies.map((c) => ({
        key: c.key, label: c.label,
        rating: rows[c.key].notAssessed ? null : rows[c.key].rating,
        evidence: rows[c.key].evidence.trim(), not_assessed: rows[c.key].notAssessed,
      })),
      overall_recommendation: overall, notes: notes.trim(),
    };
    try {
      const res = await fetch(`/api/candidates/${candidateId}/interview/rating`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "could not save"); setSubmitting(false); return; }
      router.refresh();
    } catch { setErr("network error"); setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="font-medium text-slate-800 text-[14px]">Your scorecard <span className="text-[11px] text-slate-400 font-normal">— rate each 1–4; a rating needs a quote to count</span></div>
        <span className="text-[11px] text-slate-500">{assessedCount} to score</span>
      </div>

      {competencies.map((c) => {
        const r = rows[c.key];
        const complete = r.notAssessed || (r.rating !== null && r.evidence.trim().length > 0);
        return (
          <div key={c.key} className="rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-slate-800 text-[13px]">{c.label}{c.focus && <span className="ml-1.5 text-[10px] uppercase tracking-wider bg-[#fdf0ff] text-[#AE00D0] rounded-full px-1.5 py-0.5">focus</span>}</div>
              <span className={`text-[10px] rounded-full px-2 py-0.5 ${r.notAssessed ? "bg-stone-100 text-slate-500" : complete ? "bg-emerald-50 text-emerald-700" : r.rating ? "bg-amber-50 text-amber-700" : "bg-stone-100 text-slate-400"}`}>
                {r.notAssessed ? "not assessed" : complete ? "captured ✓" : r.rating ? "add a quote" : "not scored"}
              </span>
            </div>
            {c.guide && <div className="text-[11.5px] text-slate-500 mt-1">what good looks like: {c.guide}</div>}

            {!r.notAssessed && (
              <>
                <div className="flex gap-1.5 mt-2.5">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => set(c.key, { rating: n })} title={ANCHORS[n]}
                      className={`flex-1 text-[12px] py-1.5 rounded-md border ${r.rating === n ? "bg-[#AE00D0] border-[#AE00D0] text-white" : "border-stone-300 text-slate-600 hover:bg-stone-50"}`}>{n}</button>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5 min-h-[15px]">{r.rating ? ANCHORS[r.rating] : " "}</div>
                <textarea value={r.evidence} onChange={(e) => set(c.key, { evidence: e.target.value })} rows={2}
                  placeholder="Paste the candidate’s own words that justify this score…"
                  className="w-full text-[12px] border border-stone-300 rounded-md px-2 py-1.5 resize-y" />
              </>
            )}
            <label className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500">
              <input type="checkbox" checked={r.notAssessed} onChange={(e) => set(c.key, { notAssessed: e.target.checked })} />
              didn’t cover this in the interview (exclude from the score)
            </label>
          </div>
        );
      })}

      <div className="rounded-xl border border-stone-200 bg-white p-3.5">
        <div className="font-medium text-slate-800 text-[13px]">Overall recommendation</div>
        <div className="text-[11px] text-slate-500 mb-2">Locked until every competency is scored — deferring the global call blunts first-impression bias.</div>
        <div className="flex gap-1.5">
          {OVERALL.map((o) => (
            <button key={o.key} disabled={!done} onClick={() => setOverall(o.key)}
              className={`flex-1 text-[11.5px] py-1.5 rounded-md border ${overall === o.key ? "bg-[#AE00D0] border-[#AE00D0] text-white" : "border-stone-300 text-slate-600 hover:bg-stone-50"} disabled:opacity-40 disabled:cursor-not-allowed`}>{o.label}</button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Pros / cons / follow-ups for the next round (optional)"
          className="w-full text-[12px] border border-stone-300 rounded-md px-2 py-1.5 mt-2.5 resize-y" />
        <button onClick={submit} disabled={!done || !overall || submitting}
          className="mt-3 text-[12px] font-medium rounded-md bg-[#AE00D0] text-white px-4 py-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
          {submitting ? "Locking…" : "🔒 Submit & lock my rating"}
        </button>
        {err && <div className="mt-2 text-[12px] text-rose-600">{err}</div>}
        <div className="mt-2 text-[10.5px] text-slate-400">Advisory pipeline — locking records your score + timestamp; it does not advance or reject the candidate.</div>
      </div>
    </div>
  );
}
