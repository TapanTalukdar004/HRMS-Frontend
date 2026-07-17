"use client";

import { useEffect, useState } from "react";

/**
 * Shared apply-link control (PRD 14 R1). Shows the FULL, absolute, copyable apply URL — no more
 * `/apply/xxxxxxxx… ↗` truncation. Builds the absolute URL from the live origin
 * (window.location.origin) so it's correct in dev and prod without a hardcoded SITE_URL; falls back to
 * the relative path before hydration. `compact` renders a shorter inline variant for dense list rows.
 */
export default function ApplyLink({ jobId, compact = false }: { jobId: string; compact?: boolean }) {
  const path = `/apply/${jobId}`;
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  const full = origin ? `${origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the visible full URL is still selectable */ }
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full align-bottom">
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className={`text-[#AE00D0] hover:underline ${compact ? "truncate max-w-[260px]" : "break-all"}`}
        title={full}
      >
        {full}
      </a>
      <button
        onClick={copy}
        className="shrink-0 text-[11px] rounded px-1.5 py-0.5 ring-1 ring-inset ring-stone-300 text-slate-600 hover:bg-stone-50"
        aria-label="Copy apply link"
      >
        {copied ? "✓ copied" : "copy"}
      </button>
    </span>
  );
}
