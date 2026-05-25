"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function WeekSelector({
  weeks,
  selected,
}: {
  weeks: { week_start: string }[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (weeks.length === 0) {
    return (
      <span className="text-sm text-slate-500">
        No weekly data yet for this employee.
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2.5 text-sm">
      <span className="text-slate-500 font-medium">Week</span>
      <select
        value={selected}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("week", e.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 pr-8 text-slate-900
                   focus:outline-none focus:ring-2 focus:ring-[#AE00D0] focus:border-[#AE00D0]
                   hover:border-stone-300 transition cursor-pointer shadow-sm"
      >
        {weeks.map((w) => (
          <option key={w.week_start} value={w.week_start}>
            Week of {w.week_start}
          </option>
        ))}
      </select>
    </label>
  );
}
