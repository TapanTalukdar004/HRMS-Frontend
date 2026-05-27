"use client";

import { useRouter } from "next/navigation";

/**
 * Smart back button.
 *
 * Renders identical markup on server and client (a <button>) to avoid
 * hydration mismatches.  The navigation decision happens at click time:
 *   - If the browser has history to go back to → router.back()
 *     (returns the user to wherever they came from, preserving filters
 *      / snapshot picks / scroll position).
 *   - Otherwise (direct link, refresh, fresh tab) → navigate to the
 *     explicit fallbackHref (the parent listing page).
 *
 * We always show the fallbackLabel so the text is stable across the
 * SSR → hydration boundary (no "server text didn't match client" warning).
 */
export function BackButton({
  fallbackHref,
  fallbackLabel,
}: {
  fallbackHref: string;
  fallbackLabel: string;
}) {
  const router = useRouter();

  const handleClick = () => {
    // window is only available on the client; this runs on click, never SSR.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#AE00D0] transition-colors"
    >
      <span aria-hidden>←</span> {fallbackLabel}
    </button>
  );
}
