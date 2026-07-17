"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SELECTABLE_DIMENSIONS } from "@/lib/rubric";
import { ROUND_TYPES, roundFocusFor } from "@/lib/roundTypes";

const LEVELS = ["Entry Level", "Mid Level", "Senior", "Lead", "Manager", "Director"];
const EMPLOYMENT = ["Full-Time", "Part-Time", "Contract", "Internship", "Freelance"];

// Starting weights when HR opts to customize (level-neutral, sums to 100). Off by default → the server
// uses the level-calibrated defaults. Presets are one-click starting points HR can then tweak.
const DEFAULT_WEIGHTS: Record<string, number> = { skills: 40, experience: 25, education: 15, relevance: 20 };
const WEIGHT_PRESETS: { name: string; weights: Record<string, number> }[] = [
  { name: "Balanced", weights: { skills: 40, experience: 25, education: 15, relevance: 20 } },
  { name: "Skills & experience only", weights: { skills: 60, experience: 40, education: 0, relevance: 0 } },
  { name: "Skills-heavy", weights: { skills: 60, experience: 20, education: 5, relevance: 15 } },
];

/** Create a job posting with its JD fields; the server freezes a per-job rubric on create (Phase 1).
 *  (The branded JD document still comes from the existing job-requisition-jd skill.) */
export function NewJobForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customize, setCustomize] = useState(false);
  const [dims, setDims] = useState(() =>
    SELECTABLE_DIMENSIONS.map((d) => ({ ...d, weight: DEFAULT_WEIGHTS[d.key] ?? 0, include: (DEFAULT_WEIGHTS[d.key] ?? 0) > 0 })),
  );
  const includedSum = dims.filter((d) => d.include).reduce((n, d) => n + (Number(d.weight) || 0), 0);
  const weightsValid = !customize || (includedSum === 100 && dims.some((d) => d.include));
  const applyPreset = (weights: Record<string, number>) =>
    setDims((cur) => cur.map((d) => ({ ...d, weight: weights[d.key] ?? 0, include: (weights[d.key] ?? 0) > 0 })));
  const setWeight = (key: string, val: number) =>
    setDims((cur) => cur.map((d) => (d.key === key ? { ...d, weight: Math.max(0, Math.min(100, val || 0)) } : d)));
  const toggleInclude = (key: string) =>
    setDims((cur) => cur.map((d) => (d.key === key ? { ...d, include: !d.include } : d)));

  // Interview rounds (R4) — optional. Empty = today's single implicit interview (backward-compatible).
  type Round = { name: string; round_type: string; weight: number; focus_prompt: string };
  const [rounds, setRounds] = useState<Round[]>([]);
  const [screeningWeight, setScreeningWeight] = useState(30);
  const roundsSum = rounds.reduce((n, r) => n + (Number(r.weight) || 0), 0);
  const roundsValid = rounds.length === 0 || roundsSum === 100;
  const addRound = () =>
    setRounds((cur) => {
      const t = ROUND_TYPES[0];
      return [...cur, { name: t.label, round_type: t.key, weight: 0, focus_prompt: t.focus }];
    });
  const removeRound = (i: number) => setRounds((cur) => cur.filter((_, idx) => idx !== i));
  const updateRound = (i: number, patch: Partial<Round>) =>
    setRounds((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const setRoundType = (i: number, key: string) =>
    updateRound(i, { round_type: key, name: ROUND_TYPES.find((t) => t.key === key)?.label ?? "Round", focus_prompt: roundFocusFor(key) });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.get("title"),
          level: f.get("level"),
          department: f.get("department"),
          employment_type: f.get("employment_type"),
          openings: f.get("openings"),
          min_experience: f.get("min_experience"),
          salary_min: f.get("salary_min"),
          salary_max: f.get("salary_max"),
          currency: f.get("currency"),
          required_skills: f.get("required_skills"),
          responsibilities: f.get("responsibilities"),
          summary: f.get("summary"),
          apply_questions: f.get("apply_questions"),
          dimensions: customize ? dims.filter((d) => d.include).map((d) => ({ key: d.key, weight: d.weight })) : undefined,
          rounds: rounds.length ? rounds.map((r) => ({ name: r.name, round_type: r.round_type, weight: r.weight, focus_prompt: r.focus_prompt })) : undefined,
          screening_weight: rounds.length ? screeningWeight : undefined,
          is_published: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) { setOpen(false); router.refresh(); }
      else setError(body.error || "Could not create the posting.");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] text-white text-sm font-medium px-4 py-2">
        + New job posting
      </button>
    );
  }

  const input = "w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE00D0]/30 focus:border-[#AE00D0]";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="title">Job title *</label>
          <input id="title" name="title" required className={input} placeholder="Backend Engineer" />
        </div>
        <div>
          <label className={label} htmlFor="level">Level</label>
          <select id="level" name="level" className={input} defaultValue="Mid Level">
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="department">Department</label>
          <input id="department" name="department" className={input} placeholder="Engineering" />
        </div>
        <div>
          <label className={label} htmlFor="employment_type">Employment type</label>
          <select id="employment_type" name="employment_type" className={input} defaultValue="Full-Time">
            {EMPLOYMENT.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="min_experience">Min experience (yrs)</label>
          <input id="min_experience" name="min_experience" type="number" min={0} step="0.5" className={input} placeholder="3" />
        </div>
        <div>
          <label className={label} htmlFor="openings">Openings</label>
          <input id="openings" name="openings" type="number" min={1} defaultValue={1} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="salary_min">CTC min</label>
          <input id="salary_min" name="salary_min" type="number" min={0} className={input} placeholder="800000" />
        </div>
        <div>
          <label className={label} htmlFor="salary_max">CTC max</label>
          <div className="flex gap-2">
            <input id="salary_max" name="salary_max" type="number" min={0} className={input} placeholder="1400000" />
            <select name="currency" className={input + " w-24"} defaultValue="INR">
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="required_skills">Required skills (comma or newline separated)</label>
        <textarea id="required_skills" name="required_skills" rows={2} className={input} placeholder="Python, FastAPI, PostgreSQL, REST APIs" />
      </div>
      <div>
        <label className={label} htmlFor="responsibilities">Key responsibilities (one per line)</label>
        <textarea id="responsibilities" name="responsibilities" rows={3} className={input} placeholder={"Design and ship backend services\nOwn API performance and reliability"} />
      </div>
      <div>
        <label className={label} htmlFor="summary">Short summary</label>
        <textarea id="summary" name="summary" rows={2} className={input} placeholder="One or two lines about the role" />
      </div>
      <div>
        <label className={label} htmlFor="apply_questions">Custom application questions (optional, one per line)</label>
        <textarea id="apply_questions" name="apply_questions" rows={2} className={input} placeholder={"Why do you want to join RUH AI?\nDescribe a project you're proud of."} />
        <p className="text-[10.5px] text-slate-400 mt-1">Shown on the candidate&apos;s apply form; answers appear on their profile.</p>
      </div>

      {/* Scoring criteria & weights (R3) — optional; default = level-calibrated weights */}
      <div className="rounded-lg border border-stone-200 bg-stone-50/40 p-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={customize} onChange={(e) => setCustomize(e.target.checked)} className="accent-[#AE00D0]" />
          <span className="text-[13px] font-medium text-slate-700">Customize scoring criteria &amp; weights</span>
          {!customize && <span className="text-[11px] text-slate-400">· using level-calibrated defaults</span>}
        </label>
        {customize && (
          <div className="mt-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider mr-0.5 self-center">preset</span>
              {WEIGHT_PRESETS.map((p) => (
                <button key={p.name} type="button" onClick={() => applyPreset(p.weights)}
                  className="text-[11.5px] rounded-md border border-stone-300 text-slate-600 px-2 py-1 hover:bg-white">{p.name}</button>
              ))}
            </div>
            {dims.map((d) => (
              <div key={d.key} className="flex items-center gap-2">
                <input type="checkbox" checked={d.include} onChange={() => toggleInclude(d.key)} className="accent-[#AE00D0]" aria-label={`Include ${d.label}`} />
                <span className={`text-[13px] w-32 ${d.include ? "text-slate-700" : "text-slate-400 line-through"}`}>{d.label}</span>
                <input type="number" min={0} max={100} value={d.weight} disabled={!d.include}
                  onChange={(e) => setWeight(d.key, parseInt(e.target.value, 10))}
                  className="w-20 px-2 py-1 rounded border border-stone-300 text-sm disabled:bg-stone-100 disabled:text-slate-400" />
                <span className="text-[12px] text-slate-400">%</span>
              </div>
            ))}
            <div className={`text-[12px] font-medium ${includedSum === 100 ? "text-emerald-700" : "text-rose-600"}`}>
              Total: {includedSum}% {includedSum === 100 ? "✓" : "— must equal 100%"}
            </div>
            <p className="text-[10.5px] text-slate-400">Uncheck a criterion to drop it (e.g. “skills &amp; experience only”). Required skills above become the must-haves.</p>
          </div>
        )}
      </div>

      {/* Interview rounds (R4) — optional; empty = a single implicit interview (backward-compatible) */}
      <div className="rounded-lg border border-stone-200 bg-stone-50/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-slate-700">Interview rounds <span className="text-[11px] text-slate-400 font-normal">· optional</span></span>
          <button type="button" onClick={addRound} className="text-[11.5px] rounded-md border border-stone-300 text-slate-600 px-2 py-1 hover:bg-white">+ Add round</button>
        </div>
        {rounds.length === 0 ? (
          <p className="text-[11px] text-slate-400 mt-1.5">No rounds set — a single interview is used. Add rounds (e.g. Technical, HR) so the AI generates round-specific questions and each round is scored into the overall.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {rounds.map((r, i) => (
              <div key={i} className="rounded-lg border border-stone-200 bg-white p-2.5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-slate-400 w-4 shrink-0">{i + 1}.</span>
                  <select value={r.round_type} onChange={(e) => setRoundType(i, e.target.value)} className="text-[12.5px] px-2 py-1 rounded border border-stone-300">
                    {ROUND_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <input value={r.name} onChange={(e) => updateRound(i, { name: e.target.value })} className="flex-1 min-w-[8rem] text-[12.5px] px-2 py-1 rounded border border-stone-300" placeholder="Round name" />
                  <input type="number" min={0} max={100} value={r.weight} onChange={(e) => updateRound(i, { weight: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })} className="w-16 text-[12.5px] px-2 py-1 rounded border border-stone-300" />
                  <span className="text-[11px] text-slate-400">%</span>
                  <button type="button" onClick={() => removeRound(i)} aria-label="Remove round" className="text-[12px] text-rose-500 hover:text-rose-700 px-1">✕</button>
                </div>
                <textarea value={r.focus_prompt} onChange={(e) => updateRound(i, { focus_prompt: e.target.value })} rows={2} className="w-full text-[12px] px-2 py-1 rounded border border-stone-300" placeholder="What this round focuses on (drives the AI's per-round questions)" />
              </div>
            ))}
            <div className={`text-[12px] font-medium ${roundsSum === 100 ? "text-emerald-700" : "text-rose-600"}`}>
              Rounds total: {roundsSum}% {roundsSum === 100 ? "✓" : "— must equal 100%"}
            </div>
            <div className="flex items-center gap-2 text-[12px] text-slate-600 flex-wrap">
              <span>Screening counts for</span>
              <input type="number" min={0} max={100} value={screeningWeight} onChange={(e) => setScreeningWeight(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))} className="w-16 px-2 py-1 rounded border border-stone-300" />
              <span>% of the overall; the rounds share the other {100 - screeningWeight}%.</span>
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !weightsValid || !roundsValid}
          title={!weightsValid ? "Scoring weights must total 100%" : !roundsValid ? "Interview round weights must total 100%" : undefined}
          className="rounded-lg bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
          {busy ? "Creating…" : "Create, publish & freeze rubric"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-lg bg-stone-100 hover:bg-stone-200 text-slate-700 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  );
}
