"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The HUMAN decision controls for one candidate. Posts to /api/candidates/[id]/stage — the ONLY place a
 * candidate advances / is rejected / gets an offer / is hired. The AI never sets these; a human clicks
 * every one (PRD 07 no-auto-reject). Buttons are stage-aware: screened → Advance; interviewed → Make
 * offer; offer → Mark hired.
 */
type Action = "shortlist" | "reject" | "reset" | "offer" | "hire";

export default function ShortlistActions({ id, stage }: { id: string; stage: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: Action) {
    setErr(null); setBusy(action);
    try {
      const r = await fetch(`/api/candidates/${id}/stage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setErr(j.error || "failed"); return; }
      start(() => router.refresh());
    } catch { setErr("network error"); } finally { setBusy(null); }
  }

  const disabled = pending || busy !== null;
  const primary = "text-[11px] font-medium rounded-md bg-emerald-600 text-white px-2.5 py-1 hover:bg-emerald-700 disabled:opacity-50";
  const danger = "text-[11px] font-medium rounded-md ring-1 ring-inset ring-rose-200 text-rose-700 px-2.5 py-1 hover:bg-rose-50 disabled:opacity-50";
  const subtle = "text-[11px] rounded-md text-slate-500 px-2 py-1 hover:bg-stone-100 disabled:opacity-50";
  const B = (a: Action, cls: string, label: string) => (
    <button onClick={() => act(a)} disabled={disabled} className={cls}>{busy === a ? "…" : label}</button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {(stage === "applied" || stage === "screened") && B("shortlist", primary, "Advance")}
      {stage === "interviewed" && B("offer", primary, "Make offer")}
      {stage === "offer" && B("hire", primary, "Mark hired")}
      {stage === "hired" && <span className="text-[11px] font-medium text-emerald-700">✓ hired</span>}
      {stage !== "rejected" && stage !== "hired" && B("reject", danger, "Reject")}
      {(stage === "shortlisted" || stage === "rejected") && B("reset", subtle, "Undo")}
      {err && <span className="text-[10px] text-rose-600">{err}</span>}
    </div>
  );
}
