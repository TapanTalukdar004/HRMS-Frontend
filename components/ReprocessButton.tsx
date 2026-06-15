"use client";

import { useState } from "react";

/**
 * Tiny admin control for the Agent Lab: flags an issue so the next agent run
 * re-judges it even if the code did not change. POSTs { issue_key } to
 * /api/lab/reprocess, then reloads so the (server-rendered) page reflects the
 * flagged state. Kept client-side so the Lab page stays a server component.
 */
export function ReprocessButton({ issueKey }: { issueKey: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/lab/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_key: issueKey }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `request failed (${res.status})`);
      }
      location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Flag this issue so the next agent run re-judges it"
        className="inline-flex items-center gap-1 text-[11px] text-[#AE00D0] ring-1 ring-inset ring-[#efc6fb] rounded-full px-2 py-0.5 hover:bg-[#fdf0ff] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
      >
        {busy ? "…" : "↻"} Re-process
      </button>
      {err && <span className="text-[10px] text-rose-600">{err}</span>}
    </span>
  );
}
