"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-round interviewer scorecard (PRD 14 R6). Rate each competency 1–4 WITH an evidence quote
 * (proof-first), pick a verdict, submit → /api/candidates/[id]/round-rating. round_score = assessed 1–4
 * avg → 0..100. Advisory / ranking-only: a human still clicks advance/reject/offer/hire.
 */
type Comp = { key: string; label: string };
type Row = { rating: number | null; evidence: string; notAssessed: boolean };

const ANCHORS: Record<number, string> = {
  1: "1 · no evidence / red flag", 2: "2 · some evidence, gaps",
  3: "3 · solid, clears the bar", 4: "4 · strong, exceeds",
};
const VERDICTS = [
  { key: "strong_no", label: "strong no" }, { key: "no", label: "no" },
  { key: "yes", label: "yes" }, { key: "strong_yes", label: "strong yes" },
];

export default function RoundScorecard({ candidateId, roundSeq, competencies }: { candidateId: string; roundSeq: number; competencies: Comp[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(competencies.map((c) => [c.key, { rating: null, evidence: "", notAssessed: false }])));
  const [verdict, setVerdict] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (key: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } }));
  const done = useMemo(() => competencies.every((c) => {
    const r = rows[c.key];
    return r.notAssessed || (r.rating !== null && r.evidence.trim().length > 0);
  }), [rows, competencies]);

  async function submit() {
    if (!done || !verdict || submitting) return;
    setSubmitting(true); setErr(null);
    const payload = {
      round_seq: roundSeq, verdict, notes: notes.trim(),
      competencies: competencies.map((c) => ({
        key: c.key, label: c.label,
        rating: rows[c.key].notAssessed ? null : rows[c.key].rating,
        evidence: rows[c.key].evidence.trim(), not_assessed: rows[c.key].notAssessed,
      })),
    };
    try {
      const res = await fetch(`/api/candidates/${candidateId}/round-rating`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "could not save"); setSubmitting(false); return; }
      router.refresh();
    } catch { setErr("network error"); setSubmitting(false); }
  }

  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/50 p-3 space-y-2.5">
      <div className="text-[12px] font-semibold text-slate-700">Score this round <span className="font-normal text-slate-400">— 1–4 each; a rating needs a quote</span></div>
      {competencies.map((c) => {
        const r = rows[c.key];
        return (
          <div key={c.key} className="rounded-md border border-stone-200 bg-white p-2.5">
            <div className="text-[12.5px] font-medium text-slate-800">{c.label}</div>
            {!r.notAssessed && (
              <>
                <div className="flex gap-1.5 mt-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => set(c.key, { rating: n })} title={ANCHORS[n]}
                      className={`flex-1 text-[12px] py-1 rounded border ${r.rating === n ? "bg-[#AE00D0] border-[#AE00D0] text-white" : "border-stone-300 text-slate-600 hover:bg-stone-50"}`}>{n}</button>
                  ))}
                </div>
                <textarea value={r.evidence} onChange={(e) => set(c.key, { evidence: e.target.value })} rows={2}
                  placeholder="The candidate's own words that justify this score…"
                  className="w-full text-[12px] border border-stone-300 rounded px-2 py-1.5 mt-2 resize-y" />
              </>
            )}
            <label className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500">
              <input type="checkbox" checked={r.notAssessed} onChange={(e) => set(c.key, { notAssessed: e.target.checked })} />
              not covered in this round
            </label>
          </div>
        );
      })}
      <div>
        <div className="text-[12px] font-medium text-slate-700 mb-1">Verdict <span className="font-normal text-slate-400">— locked until each competency is scored</span></div>
        <div className="flex gap-1.5">
          {VERDICTS.map((o) => (
            <button key={o.key} type="button" disabled={!done} onClick={() => setVerdict(o.key)}
              className={`flex-1 text-[11.5px] py-1 rounded border ${verdict === o.key ? "bg-[#AE00D0] border-[#AE00D0] text-white" : "border-stone-300 text-slate-600 hover:bg-stone-50"} disabled:opacity-40`}>{o.label}</button>
          ))}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes for this round (optional)"
          className="w-full text-[12px] border border-stone-300 rounded px-2 py-1.5 mt-2 resize-y" />
        <button type="button" onClick={submit} disabled={!done || !verdict || submitting}
          className="mt-2 text-[12px] font-medium rounded-md bg-[#AE00D0] text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-40">
          {submitting ? "Saving…" : "Save round score"}
        </button>
        {err && <div className="mt-1.5 text-[12px] text-rose-600">{err}</div>}
        <div className="mt-1.5 text-[10.5px] text-slate-400">Ranking-only — saving records this round's score; it does not advance or reject the candidate.</div>
      </div>
    </div>
  );
}
