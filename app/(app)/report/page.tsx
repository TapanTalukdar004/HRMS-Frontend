/**
 * /report — RETIRED (change 172). The all-engineers evidence view folded into the two-page model:
 * the Dashboard (/overview) People list is the aggregate, and /employees/[name] is the per-engineer
 * deep-dive (verdict + transparent score + per-PR review + codebase map). Kept as a redirect so old
 * links and bookmarks land on the Dashboard.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ReportPage() {
  redirect("/overview");
}
