/**
 * Absolute performance scoring (PRD 10). Per-employee, INDEPENDENT of everyone else —
 * unlike the old `100 * points / top_performer`, one person's new PR never moves another's number.
 *
 *   score/100 = 100 × ( 0.45·Delivery + 0.30·Quality + 0.15·Craft + 0.10·Reach )
 *
 * Each part is 0..1. This is the source of truth for the VIEW side; the PERSIST side
 * (perf_tracker/score_prs.py) must mirror this exactly when it is wired in.
 */
export const SCORE_WEIGHTS = { delivery: 0.45, quality: 0.30, craft: 0.15, reach: 0.10 } as const;
export type ScoreKey = keyof typeof SCORE_WEIGHTS;

export type ScoreInput = {
  delivery: number | null; // proven size / committed size (capped 1)
  quality: number | null;  // avg AI code-quality / 10
  craft: number | null;    // review + CI + link hygiene (where the team uses them)
  reach: number | null;    // CodeGraph blast band, averaged (see reachToScore)
};
export type ScorePart = { key: ScoreKey; label: string; value: number | null; weight: number; contribution: number };
export type ScoreResult = { score: number | null; parts: ScorePart[]; reweighted: boolean; note: string | null };

const LABEL: Record<ScoreKey, string> = { delivery: "Delivery", quality: "Quality", craft: "Craft", reach: "Reach" };
const KEYS = Object.keys(SCORE_WEIGHTS) as ScoreKey[];

/** Absolute 0–100. If some parts have no data this cycle, reweight over the parts that do
 *  (PRD 10 §4 decision 2) rather than scoring the missing part as zero. */
export function computeScore(input: ScoreInput): ScoreResult {
  const present = KEYS.filter((k) => input[k] !== null);
  if (present.length === 0) {
    return { score: null, parts: KEYS.map((k) => ({ key: k, label: LABEL[k], value: null, weight: SCORE_WEIGHTS[k], contribution: 0 })), reweighted: false, note: "No scored work yet this cycle." };
  }
  const reweighted = present.length < KEYS.length;
  const wsum = present.reduce((a, k) => a + SCORE_WEIGHTS[k], 0);
  let acc = 0;
  const parts = KEYS.map<ScorePart>((k) => {
    const v = input[k];
    const effWeight = SCORE_WEIGHTS[k] / (reweighted ? wsum : 1);
    const contribution = v === null ? 0 : v * effWeight;
    if (v !== null) acc += contribution;
    return { key: k, label: LABEL[k], value: v, weight: SCORE_WEIGHTS[k], contribution };
  });
  return {
    score: Math.round(acc * 100),
    parts,
    reweighted,
    note: reweighted ? "Some parts had no data this cycle; the score is weighted over the parts that do." : null,
  };
}

/** CodeGraph blast band → a 0..1 Reach sub-score (a gentle modifier, not a big swing). */
export function reachToScore(band: string | null): number {
  switch ((band ?? "").toLowerCase()) {
    case "wide": return 1.0;
    case "moderate": return 0.75;
    default: return 0.5; // local / unknown
  }
}

/** Qualitative band from the absolute score — same thresholds everywhere. */
export function bandOf(score: number | null): "strong" | "ok" | "weak" | "none" {
  if (score === null) return "none";
  if (score >= 75) return "strong";
  if (score >= 55) return "ok";
  return "weak";
}

/** Plain-language definitions — the single source for field tooltips across the dashboard,
 *  so HR and employees see the same words. */
export const FIELD_DEFS = {
  score: "Your performance score out of 100 — built only from your own work, never a ranking against teammates.",
  delivery: "Of the work you took on, how much shipped with proof (proven size ÷ committed size).",
  quality: "The AI code-review read on your merged pull requests, on a 0–10 scale.",
  craft: "Hygiene — reviewed, CI-passing, linked to a ticket (only counted where the team uses these).",
  reach: "How far your changes ripple through the codebase — local, moderate, or wide.",
  pointsEarned: "The credited value of your proven work: Size × Quality × Bug × Proof × Together × Reach, summed across your issues.",
  size: "How big and urgent a piece of work is — story points × priority.",
  onPlan: "Share of your merged pull requests that were on your own assigned tickets.",
  proven: "An issue counts as proven once a merged pull request for it exists and has been quality-assessed.",
} as const;
