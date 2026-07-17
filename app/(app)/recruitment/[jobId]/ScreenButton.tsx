"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-candidate Screen / Retry control (PRD 14 R0). Posts to /api/candidates/[id]/screen — screens an
 * UNSCREENED candidate, or RETRIES a FAILED one. Advisory only: it produces the score and moves
 * applied→screened; it never shortlists/rejects. The screener self-records screen_status/screen_error,
 * so a failure surfaces HERE (never the old silent "applied"). The score appears after the background
 * screen finishes (~30–120s) — the button reflects pending/processing and the error if it fails.
 */
export default function ScreenButton({ id, status, error }: { id: string; status: string | null; error: string | null }) {
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
      const r = await fetch(`/api/candidates/${id}/screen`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) { setMsg(j.error || "failed to start"); setBusy(false); return; }
      setMsg("screening… score appears in ~30–120s");
      start(() => router.refresh());
      setTimeout(() => start(() => router.refresh()), 4000);
    } catch {
      setMsg("network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy || pending || running}
        className={`text-[11px] font-medium rounded-md px-2.5 py-1 disabled:opacity-60 ${
          failed
            ? "ring-1 ring-inset ring-amber-300 text-amber-800 hover:bg-amber-50"
            : "bg-[#AE00D0] text-white hover:bg-[#9000AE]"
        }`}
      >
        {busy ? "…" : running ? "Screening…" : failed ? "Retry screening" : "Screen"}
      </button>
      {failed && error && <span title={error} className="text-[10px] text-rose-600 max-w-[190px] truncate">✗ {error}</span>}
      {msg && <span className="text-[10px] text-slate-500 max-w-[190px] text-right">{msg}</span>}
    </div>
  );
}
