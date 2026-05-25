"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { clsx } from "@/lib/cn";

export type TabKey = "overview" | "weekly" | "monthly" | "quarterly" | "annual";

const TABS: { key: TabKey; label: string; icon: string; comingSoon?: boolean }[] = [
  { key: "overview",  label: "Overview",  icon: "📊" },
  { key: "weekly",    label: "Weekly",    icon: "📅" },
  { key: "monthly",   label: "Monthly",   icon: "📆", comingSoon: true },
  { key: "quarterly", label: "Quarterly", icon: "🗓️", comingSoon: true },
  { key: "annual",    label: "Annual",    icon: "🎯", comingSoon: true },
];

export function TabNav({ active }: { active: TabKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="border-b border-stone-200 mb-6">
      <nav className="flex flex-wrap gap-0.5 -mb-px" aria-label="Tabs">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("tab", t.key);
                if (t.key !== "weekly") params.delete("week");
                router.push(`${pathname}?${params.toString()}`);
              }}
              className={clsx(
                "px-4 py-3 text-sm font-medium border-b-2 transition flex items-center gap-2",
                isActive
                  ? "border-[#AE00D0] text-[#AE00D0]"
                  : "border-transparent text-slate-500 hover:text-slate-900 hover:border-stone-300",
              )}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {t.comingSoon && (
                <span className="ml-1 text-[10px] uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-1.5 py-0.5">
                  soon
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
