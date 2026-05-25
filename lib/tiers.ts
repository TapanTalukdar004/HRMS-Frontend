/*
 * Shared helpers for rendering performance tiers and goal statuses.
 *
 * Tiers come from `scoring.py` on the backend and are presented as
 * short strings like "Full bonus", "Partial bonus", "Manager 1:1",
 * "Growth plan". The exact wording can vary; we match by substring.
 */

export type Tier =
  | "full"
  | "partial"
  | "coach"
  | "growth"
  | "unknown";

export type GoalStatus = "completed" | "partial" | "not_completed" | null;

export function classifyTier(tier: string | null | undefined): Tier {
  if (!tier) return "unknown";
  if (tier.includes("Full")) return "full";
  if (tier.includes("Partial")) return "partial";
  if (tier.includes("Manager")) return "coach";
  return "growth";
}

/** Foreground text color for a tier label, on a light surface. */
export function tierTextClass(tier: string | null | undefined): string {
  switch (classifyTier(tier)) {
    case "full":    return "text-emerald-700";
    case "partial": return "text-amber-700";
    case "coach":   return "text-blue-700";
    case "growth":  return "text-rose-700";
    default:        return "text-slate-500";
  }
}

/** Soft chip background + foreground for a tier. */
export function tierChipClass(tier: string | null | undefined): string {
  switch (classifyTier(tier)) {
    case "full":    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "partial": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "coach":   return "bg-blue-50 text-blue-700 ring-blue-200";
    case "growth":  return "bg-rose-50 text-rose-700 ring-rose-200";
    default:        return "bg-slate-50 text-slate-600 ring-slate-200";
  }
}

/** Solid swatch hex used for chart strokes/fills. */
export function tierHex(tier: string | null | undefined): string {
  switch (classifyTier(tier)) {
    case "full":    return "#059669";
    case "partial": return "#d97706";
    case "coach":   return "#2563eb";
    case "growth":  return "#e11d48";
    default:        return "#94a3b8";
  }
}

export function statusEmoji(status: GoalStatus): string {
  if (status === "completed")     return "✅";
  if (status === "partial")       return "🟡";
  if (status === "not_completed") return "❌";
  return "❓";
}

export function statusChipClass(status: GoalStatus): string {
  if (status === "completed")     return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "partial")       return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "not_completed") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
}

export function statusLabel(status: GoalStatus): string {
  if (status === "completed")     return "Completed";
  if (status === "partial")       return "Partial";
  if (status === "not_completed") return "Not completed";
  return "No update";
}

export function formatScore(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n}%`;
}
