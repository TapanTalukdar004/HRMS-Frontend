"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/cn";
import { Logo } from "./Logo";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  comingSoon?: boolean;
  hrOnly?: boolean;
};

type NavSection = { title: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    title: "Performance",
    items: [
      { href: "/teams",     label: "Teams",     icon: "🧑‍🤝‍🧑" },
      { href: "/employees", label: "Employees", icon: "👥" },
    ],
  },
  {
    title: "Skills",
    items: [
      { href: "/skills/jd",                 label: "Job Description", icon: "📄" },
      { href: "/skills/experience-letter",  label: "Experience Letter", icon: "📜" },
      { href: "/skills/promotion-letter",   label: "Promotion Letter",  icon: "🎉" },
      { href: "/skills/resume-screener",    label: "Resume Screener",   icon: "🤖" },
    ],
  },
  {
    title: "HR",
    items: [
      { href: "/policies", label: "Policies", icon: "⚙️" },
    ],
  },
];

export function Sidebar({ userName, userRole }: { userName?: string; userRole?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-stone-200 min-h-screen flex flex-col">
      {/* Brand */}
      <Link href="/" className="block px-5 py-5 border-b border-stone-200 group">
        <Logo variant="wordmark" height={26} priority />
        <div className="mt-2 text-[10px] text-slate-500 uppercase tracking-[0.18em]">
          HR Bot · People Ops
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV.map((section) => (
          <div key={section.title} className="mb-6">
            <div className="px-3 mb-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                        active
                          ? "bg-[#fdf0ff] text-[#AE00D0] font-medium"
                          : "text-slate-600 hover:text-slate-900 hover:bg-stone-100",
                      )}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.comingSoon && (
                        <span className="text-[9px] uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 rounded-full px-1.5 leading-none py-0.5">
                          soon
                        </span>
                      )}
                      {item.hrOnly && !item.comingSoon && (
                        <span className="text-[9px] uppercase tracking-wider bg-[#f0ebff] text-[#6745E8] ring-1 ring-inset ring-[#dcd1ff] rounded-full px-1.5 leading-none py-0.5">
                          hr
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer / signed-in user */}
      <div className="px-4 py-3 border-t border-stone-200 text-xs">
        <div className="text-slate-500">Signed in as</div>
        <div className="text-slate-900 font-medium mt-0.5 truncate">
          {userName ?? "—"}
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">
          {userRole ?? "viewer"}
        </div>
      </div>
    </aside>
  );
}
