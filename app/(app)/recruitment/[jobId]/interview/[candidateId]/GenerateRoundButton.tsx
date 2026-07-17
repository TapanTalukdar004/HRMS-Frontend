"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * "Generate questions for Round N" — the explicit, lazy per-round trigger (rounds-UX rework). Posts to
 * /api/candidates/[id]/prep {round_seq}; the AI generates ONLY that round's pointed question set on demand,
 * so rounds a candidate never reaches are never generated. Questions appear on refresh (~20–60s).
 */
export default function GenerateRoundButton({ candidateId, roundSeq, roundName }: { candidateId: string; roundSeq: number; roundName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/candidates/${candidateId}/prep`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round_seq: roundSeq }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg(j.error || "could not start"); setBusy(false); return; }
      setMsg("generating… questions appear on refresh (~20–60s)");
      start(() => router.refresh());
      setTimeout(() => start(() => router.refresh()), 5000);
    } catch { setMsg("network error"); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button onClick={run} disabled={busy || pending}
        className="text-[13px] font-medium rounded-lg bg-[#AE00D0] text-white px-4 py-2 hover:bg-[#9000AE] disabled:opacity-60">
        {busy ? "Starting…" : `Generate questions for ${roundName}`}
      </button>
      {msg && <span className="text-[11.5px] text-slate-500">{msg}</span>}
    </div>
  );
}
