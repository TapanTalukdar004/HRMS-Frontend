/**
 * Phase-weighted overall score ledger (PRD 14 R6 · Δ1). Blends the screening score and each interview
 * round's score into ONE overall — RANKING-ONLY; a human still decides advance/reject/offer/hire.
 *
 * overall weight of screening = phase_weights.screening
 * overall weight of round r   = phase_weights.rounds × (r.weight / Σ round weights)
 * overall = Σ (overallWeight% × phaseScore)   — null until screening + every round are scored.
 */
export type PhaseWeights = { screening?: number; rounds?: number } | null;
export type LedgerRound = { seq: number; name: string; weight: number; score: number | null };
export type LedgerRow = { key: string; label: string; overallWeight: number; score: number | null; contribution: number | null };
export type Ledger = { rows: LedgerRow[]; overall: number | null; ratedRounds: number; totalRounds: number; complete: boolean };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeLedger(args: {
  screeningScore: number | null;
  phaseWeights: PhaseWeights;
  rounds: LedgerRound[];
}): Ledger {
  const { screeningScore, rounds } = args;

  // No interview rounds → the overall is just the screening score (backward-compatible).
  if (!rounds.length) {
    return {
      rows: [{ key: "screening", label: "Screening", overallWeight: 100, score: screeningScore, contribution: screeningScore }],
      overall: screeningScore, ratedRounds: 0, totalRounds: 0, complete: screeningScore != null,
    };
  }

  const pw = args.phaseWeights || {};
  const scrW = typeof pw.screening === "number" ? pw.screening : 30;
  const rndW = typeof pw.rounds === "number" ? pw.rounds : 100 - scrW;
  const roundsWeightSum = rounds.reduce((n, r) => n + (Number(r.weight) || 0), 0) || 1;

  const rows: LedgerRow[] = [
    { key: "screening", label: "Screening", overallWeight: scrW, score: screeningScore,
      contribution: screeningScore == null ? null : r1((scrW / 100) * screeningScore) },
  ];
  let ratedRounds = 0;
  for (const r of rounds) {
    const ow = r1(rndW * ((Number(r.weight) || 0) / roundsWeightSum));
    if (r.score != null) ratedRounds++;
    rows.push({
      key: `round-${r.seq}`, label: r.name || `Round ${r.seq}`, overallWeight: ow, score: r.score,
      contribution: r.score == null ? null : r1((ow / 100) * r.score),
    });
  }

  const complete = screeningScore != null && ratedRounds === rounds.length;
  const overall = complete ? r1(rows.reduce((n, x) => n + (x.contribution ?? 0), 0)) : null;
  return { rows, overall, ratedRounds, totalRounds: rounds.length, complete };
}
