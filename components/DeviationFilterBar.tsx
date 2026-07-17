"use client";

import { useState } from "react";
import { clsx } from "@/lib/cn";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "security", label: "Security" },
  { key: "mismatch", label: "Title ≠ work" },
  { key: "offticket", label: "Off-plan" },
  { key: "noproof", label: "No proof" },
  { key: "unpointed", label: "No story points" },
];

/** Client filter that shows/hides the server-rendered engineer blocks by their
 *  data-* attributes — keeps the heavy cards on the server, no refetch. */
export function DeviationFilterBar({ counts }: { counts: Record<string, number> }) {
  const [active, setActive] = useState("all");
  function apply(key: string) {
    setActive(key);
    document.querySelectorAll<HTMLElement>("[data-eng]").forEach((b) => {
      const show = key === "all" ? true : key === "attention" ? b.dataset.attention === "1" : b.dataset[key] === "1";
      b.style.display = show ? "" : "none";
    });
  }
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => apply(f.key)}
          className={clsx(
            "px-3 py-1.5 rounded-full text-[12px] font-medium ring-1 ring-inset transition-colors",
            active === f.key ? "bg-[#7B5AFF] text-white ring-[#7B5AFF]" : "bg-white text-slate-600 ring-stone-200 hover:bg-stone-50",
          )}
        >
          {f.label}{f.key !== "all" && counts[f.key] ? ` (${counts[f.key]})` : ""}
        </button>
      ))}
    </div>
  );
}
