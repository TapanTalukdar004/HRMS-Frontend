"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** HR "Screen all unscreened" button (Track 4). Kicks off the background screener for the job, then
 *  gently refreshes the page a few times so scores appear as they finish. Advisory only — screening
 *  never shortlists/rejects. */
export default function ScreenAllButton({ jobId, unscreened }: { jobId: string; unscreened: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/screen`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) { setMsg(j.error || "could not start"); setBusy(false); return; }
      const n = j.unscreened ?? unscreened;
      setMsg(n > 0 ? `Screening ${n} applicant${n === 1 ? "" : "s"} in the background — scores appear as they finish.` : "All applicants are already screened.");
      // gentle auto-refresh so results surface without a manual reload
      [8000, 20000, 40000].forEach((t) => setTimeout(() => router.refresh(), t));
      setTimeout(() => setBusy(false), 8000);
    } catch {
      setMsg("network error"); setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={run} disabled={busy}
        className="text-[12px] font-medium rounded-md bg-[#AE00D0] text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
        {busy ? "Screening…" : unscreened > 0 ? `Screen ${unscreened} unscreened` : "Re-screen all"}
      </button>
      {msg && <span className="text-[11.5px] text-slate-500">{msg}</span>}
    </div>
  );
}
