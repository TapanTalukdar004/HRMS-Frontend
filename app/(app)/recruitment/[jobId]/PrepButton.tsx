"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-candidate interview-prep Generate / Retry control (PRD 14 RC4). Posts to /api/candidates/[id]/prep.
 * Prep is an advisory preparation aid (never a gate). interview_prep.py self-records prep_status/prep_error,
 * so a background failure surfaces HERE (never the old silent gap). The sheet appears ~30–120s after start.
 */
export default function PrepButton({ id, status, error }: { id: string; status: string | null; error: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const running = status === "pending" || status === "processing";
  const failed = status === "failed";

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/candidates/${id}/prep`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg(j.error || "failed to start"); setBusy(false); return; }
      setMsg("generating… prep appears in ~30–120s");
      start(() => router.refresh());
      setTimeout(() => start(() => router.refresh()), 4000);
    } catch {
      setMsg("network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={run}
        disabled={busy || pending || running}
        className={`text-[12px] font-medium rounded-md px-3 py-1.5 disabled:opacity-60 ${
          failed
            ? "ring-1 ring-inset ring-amber-300 text-amber-800 hover:bg-amber-50"
            : "bg-[#AE00D0] text-white hover:bg-[#9000AE]"
        }`}
      >
        {busy ? "…" : running ? "Generating…" : failed ? "Retry prep" : "Generate prep"}
      </button>
      {failed && error && <span title={error} className="text-[11px] text-rose-600">✗ {error}</span>}
      {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
    </div>
  );
}
