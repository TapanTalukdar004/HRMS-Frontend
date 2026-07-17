/**
 * Interview round types + their default focus prompt (PRD 14 R4/R5). The focus prompt is what the
 * per-round question-generation agent (R5) is told to focus on for that round; HR can edit it per posting.
 * These are only defaults/suggestions — the `custom` type (or any edit) lets HR shape the round freely.
 */
export type RoundTypeDef = { key: string; label: string; focus: string };

export const ROUND_TYPES: RoundTypeDef[] = [
  {
    key: "screening_call",
    label: "Screening call",
    focus:
      "A short intro call — confirm basics, genuine interest, availability/notice, and surface any red flags before deeper rounds.",
  },
  {
    key: "technical",
    label: "Technical",
    focus:
      "Probe hands-on technical depth on the candidate's claimed skills vs the JD — walk-me-through real work, trade-offs, and debugging; distinguish firsthand ownership from team/observed.",
  },
  {
    key: "coding",
    label: "Coding / practical",
    focus:
      "A live or practical exercise — assess correctness, approach, edge cases, and how the candidate reasons while being observed; probe why, not just what.",
  },
  {
    key: "system_design",
    label: "System / domain design",
    focus:
      "Probe architecture / design decisions, scale & reliability trade-offs, and how the candidate structures a realistic problem in this field.",
  },
  {
    key: "managerial",
    label: "Managerial",
    focus:
      "Ownership, stakeholder handling, prioritization, and leadership/mentoring signals appropriate to the level.",
  },
  {
    key: "hr_culture",
    label: "HR / Culture",
    focus:
      "Company-fit, motivation, and communication — draw on the company JD and the candidate's profile so HR can ask directly; check values, expectations, comp/notice, and logistics.",
  },
  {
    key: "custom",
    label: "Custom",
    focus: "",
  },
];

export const roundFocusFor = (key: string): string => ROUND_TYPES.find((t) => t.key === key)?.focus ?? "";
