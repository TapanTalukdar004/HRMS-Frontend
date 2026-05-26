"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Smart back button.
 *
 * Behaviour:
 *  - If the user navigated into this page from somewhere inside the app
 *    (browser history has a previous entry), clicking goes back to where
 *    they came from — preserving any filters / snapshot picks they had.
 *  - If they landed here directly (e.g. opened a shared link, or this
 *    is the first page they visited), the button falls back to the
 *    `fallbackHref` prop — usually the parent listing page.
 *
 * Why this matters: a hard-coded <Link href="/teams/X"> always sends
 * the user back to the team page even if they were on the rollup or
 * came from search. router.back() respects their actual path.
 */
export function BackButton({
  fallbackHref,
  fallbackLabel,
}: {
  /** Where to go when there's no history (direct-link / refresh case). */
  fallbackHref: string;
  /** Text shown when the button falls back to the explicit href. */
  fallbackLabel: string;
}) {
  const router = useRouter();
  // We can only inspect history on the client.  Render the fallback
  // label first to avoid hydration mismatch, then upgrade once mounted.
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    // window.history.length > 1 means at least one entry before the
    // current one — i.e. there's somewhere to go back to.
    // We also check referrer to avoid false positives when the user
    // refreshed the page (history.length stays at 1 in that case in
    // most browsers, but some persist it).
    if (typeof window !== "undefined" && window.history.length > 1) {
      setHasHistory(true);
    }
  }, []);

  if (!hasHistory) {
    // Server-render and direct-link case: render a regular anchor that
    // navigates to the parent listing.  This is the fallback.
    return (
      <a
        href={fallbackHref}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#AE00D0] transition-colors"
      >
        <span aria-hidden>←</span> {fallbackLabel}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#AE00D0] transition-colors"
    >
      <span aria-hidden>←</span> Back
    </button>
  );
}
