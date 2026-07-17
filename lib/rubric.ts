/**
 * Deterministic, level-calibrated scoring rubric — frozen per job at publish (Phase 1).
 *
 * Base dimensions come from the resume-screener skill (Skills / Experience / Education / JD-relevance).
 * Weights and anchor wording shift by LEVEL so a fresher is judged on correct fundamentals + aptitude
 * and a senior on depth + ownership (the level-calibration invariant). Weights always sum to 100.
 * (Phase 2's screener scores against a frozen copy of this; Claude-authored per-skill anchors are a
 * later refinement — this keeps Phase 1 simple, deterministic, and testable.)
 */

export type RubricAnchors = { "1": string; "3": string; "5": string };
export type RubricDimension = { key: string; label: string; weight: number; anchors: RubricAnchors };
export type Rubric = { level: string | null; band: Band; dimensions: RubricDimension[]; must_haves: string[] };

type Band = "junior" | "mid" | "senior";

export function levelBand(level?: string | null): Band {
  const l = (level || "").toLowerCase();
  if (/(entry|intern|junior|fresher|trainee|graduate)/.test(l)) return "junior";
  if (/(senior|lead|manager|director|vp|principal|staff|head)/.test(l)) return "senior";
  return "mid";
}

const WEIGHTS: Record<Band, { skills: number; experience: number; education: number; relevance: number }> = {
  junior: { skills: 40, experience: 15, education: 20, relevance: 25 },
  mid: { skills: 45, experience: 25, education: 10, relevance: 20 },
  senior: { skills: 45, experience: 30, education: 5, relevance: 20 },
};

function skillsList(skills: string[]): string {
  const s = skills.slice(0, 6).join(", ");
  return s || "the required skills";
}

export function parseSkills(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw || "")
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
}

export function buildRubric(args: {
  level?: string | null;
  requiredSkills: string[];
  minExperience?: number | null;
  industry?: string | null;
  roleFamily?: string | null;
}): Rubric {
  const band = levelBand(args.level);
  const w = WEIGHTS[band];
  const sk = skillsList(args.requiredSkills);
  const minExp = args.minExperience ?? null;
  const expBar = minExp != null ? `${minExp}+ yrs` : "the stated experience";
  // Industry / role framing so anchors read naturally for ANY field (Civil Engineer in Construction,
  // Teacher in EdTech, …), not just software. Empty → neutral "role" wording (unchanged behaviour).
  const roleNoun = (args.roleFamily || "").trim() || "role";
  const inField = (args.industry || "").trim() ? ` in ${(args.industry as string).trim()}` : "";
  const domain = `${roleNoun}${inField}`;

  const skillsAnchors: RubricAnchors =
    band === "senior"
      ? { "5": `Deep, proven ownership across ${sk} in real ${roleNoun} work at scale, with metrics.`,
          "3": `Has most of ${sk} but limited depth or scale evidence.`,
          "1": `Missing several of ${sk}, or only surface familiarity.` }
      : band === "junior"
      ? { "5": `Solid fundamentals in ${sk}, shown through real ${roleNoun} projects/coursework, and clear aptitude to grow.`,
          "3": `Knows some of ${sk} at a basic level; gaps expected for the level.`,
          "1": `Little evidence of ${sk} even at a fundamentals level.` }
      : { "5": `Strong, hands-on command of ${sk} with real ${roleNoun} delivery evidence.`,
          "3": `Has most of ${sk} but uneven depth.`,
          "1": `Missing several of ${sk}.` };

  const experienceAnchors: RubricAnchors =
    band === "junior"
      ? { "5": `Internships/projects clearly relevant to this ${domain}; ready to contribute.`,
          "3": `Some relevant exposure; light on hands-on work.`,
          "1": `No relevant experience or projects.` }
      : { "5": `Meets/exceeds ${expBar} in directly relevant ${roleNoun} work${inField}.`,
          "3": `Near the ${expBar} bar, only partly relevant.`,
          "1": `Well below ${expBar} or unrelated experience.` };

  const educationAnchors: RubricAnchors = {
    "5": `Strong qualification for this position — degree, certification, or licensure where the field requires it.`,
    "3": `A relevant qualification or comparable background.`,
    "1": `No relevant education/credential where it matters for this position.`,
  };

  const relevanceAnchors: RubricAnchors = {
    "5": `Career trajectory and domain strongly match this ${domain}.`,
    "3": `Partial alignment with this ${domain}.`,
    "1": `A different track with little overlap with this ${domain}.`,
  };

  return {
    level: args.level ?? null,
    band,
    dimensions: [
      { key: "skills", label: "Skills match", weight: w.skills, anchors: skillsAnchors },
      { key: "experience", label: "Experience", weight: w.experience, anchors: experienceAnchors },
      { key: "education", label: "Education", weight: w.education, anchors: educationAnchors },
      { key: "relevance", label: "JD relevance", weight: w.relevance, anchors: relevanceAnchors },
    ],
    must_haves: args.requiredSkills,
  };
}

/** The standard dimensions HR can toggle / reweight at posting-create (PRD 14 R3). */
export const SELECTABLE_DIMENSIONS: { key: string; label: string }[] = [
  { key: "skills", label: "Skills match" },
  { key: "experience", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "relevance", label: "JD relevance" },
];

/**
 * Apply an HR weight selection to a base rubric: keep only the picked keys, override their weights (in the
 * given order), and REUSE the base (level + industry/role-aware) anchors. Returns null if the picks are
 * invalid — empty, an unknown key, or weights that don't total 100 — so the caller can reject cleanly.
 */
export function selectDimensions(base: Rubric, picks: { key: string; weight: number }[]): RubricDimension[] | null {
  if (!picks.length) return null;
  const sum = picks.reduce((n, p) => n + (Number(p.weight) || 0), 0);
  if (Math.round(sum) !== 100) return null;
  const out: RubricDimension[] = [];
  for (const p of picks) {
    const b = base.dimensions.find((d) => d.key === p.key);
    if (!b) return null;
    out.push({ ...b, weight: Math.round(Number(p.weight)) });
  }
  return out;
}
