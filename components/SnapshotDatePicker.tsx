"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export type SnapshotOption = {
  id: string;
  snapshot_at: string;   // ISO timestamp
  days_left: number | null;
  is_current: boolean;
  cycle_name?: string;   // when set, the picker can jump ACROSS cycles
};

export function SnapshotDatePicker({
  options,
  selectedId,
  team,
  currentCycleName,
}: {
  options: SnapshotOption[];
  selectedId: string;
  team?: string;             // needed to build cross-cycle URLs
  currentCycleName?: string; // the cycle this page is currently showing
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // multiple cycles present → label each date with its cycle
  const multiCycle = new Set(options.map((o) => o.cycle_name).filter(Boolean)).size > 1;

  const formatLabel = (o: SnapshotOption) => {
    const d = new Date(o.snapshot_at);
    const datePart = d.toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
    const cyclePart = multiCycle && o.cycle_name ? `${o.cycle_name}  ·  ` : "";
    const daysSuffix =
      o.days_left === null ? "" :
      o.days_left === 0 ? "  ·  END OF CYCLE" :
      `  ·  ${o.days_left} day${o.days_left !== 1 ? "s" : ""} left`;
    const currentTag = o.is_current ? "  ·  latest" : "";
    return `${cyclePart}${datePart}${daysSuffix}${currentTag}`;
  };

  const navigate = (id: string) => {
    const opt = options.find((o) => o.id === id);
    const params = new URLSearchParams(searchParams);
    params.set("snapshot", id);
    // If the chosen date belongs to a DIFFERENT cycle, jump to that cycle's page.
    let target = pathname;
    if (team && opt?.cycle_name && currentCycleName && opt.cycle_name !== currentCycleName) {
      target = `/teams/${encodeURIComponent(team)}/cycles/${encodeURIComponent(opt.cycle_name)}`;
    }
    startTransition(() => {
      router.push(`${target}?${params.toString()}`);
    });
  };

  const idx = options.findIndex((o) => o.id === selectedId);
  const prevId = idx > 0 ? options[idx - 1].id : null;
  const nextId = idx >= 0 && idx < options.length - 1 ? options[idx + 1].id : null;
  const currentId = options.find((o) => o.is_current)?.id ?? options[options.length - 1]?.id;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Dropdown */}
      <div className="relative">
        <select
          value={selectedId}
          onChange={(e) => navigate(e.target.value)}
          disabled={isPending}
          className="appearance-none pl-4 pr-10 py-2.5 rounded-lg border border-stone-300 bg-white
                     text-sm font-medium text-slate-800 hover:border-[#AE00D0]
                     focus:outline-none focus:ring-2 focus:ring-[#AE00D0]/40
                     focus:border-[#AE00D0] transition cursor-pointer
                     disabled:opacity-50 min-w-[320px]"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {formatLabel(o)}
            </option>
          ))}
        </select>
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"
             width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>

      {/* Prev / Next nav buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => prevId && navigate(prevId)}
          disabled={!prevId || isPending}
          className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm
                     text-slate-600 hover:bg-stone-50 hover:border-[#AE00D0]
                     disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Previous snapshot"
        >
          ← Prev
        </button>
        <button
          onClick={() => nextId && navigate(nextId)}
          disabled={!nextId || isPending}
          className="px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm
                     text-slate-600 hover:bg-stone-50 hover:border-[#AE00D0]
                     disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Next snapshot"
        >
          Next →
        </button>
      </div>

      {/* Jump to current */}
      {currentId && currentId !== selectedId && (
        <button
          onClick={() => navigate(currentId)}
          disabled={isPending}
          className="px-3 py-2 rounded-lg bg-[#AE00D0] text-white text-sm font-medium
                     hover:bg-[#9100ad] transition"
          title="Jump to latest snapshot"
        >
          Jump to current
        </button>
      )}

      {isPending && (
        <span className="text-xs text-slate-400">Loading…</span>
      )}
    </div>
  );
}
