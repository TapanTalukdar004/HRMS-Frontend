import PreviewClient from "./PreviewClient";

// PREVIEW ONLY (PRD 10) — proposed absolute scoring + detailed per-employee page, mock data.
// Reachable by URL only (/preview/employee-scoring); not in nav; safe to delete after review.
export const metadata = { title: "Scoring preview" };

export default function Page() {
  return <PreviewClient />;
}
