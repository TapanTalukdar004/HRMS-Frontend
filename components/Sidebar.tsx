"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { clsx } from "@/lib/cn";
import { Logo } from "./Logo";
import {
  TeamsIcon, EmployeesIcon, FileTextIcon, ScrollIcon,
  AwardIcon, BotIcon, SettingsIcon, ChevronLeftIcon, ChevronRightIcon, MapIcon,
} from "./icons";

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

type NavItem = {
  href: string;
  label: string;
  Icon: IconComp;
  comingSoon?: boolean;
  hrOnly?: boolean;
};

type NavSection = { title: string; items: NavItem[] };

const NAV: NavSection[] = [
  {
    title: "Performance",
    items: [
      { href: "/teams",     label: "Teams",     Icon: TeamsIcon },
      { href: "/employees", label: "Employees", Icon: EmployeesIcon },
      { href: "/map",       label: "Issue Map", Icon: MapIcon },
    ],
  },
  {
    title: "Skills",
    items: [
      { href: "/skills/jd",                 label: "Job Description",    Icon: FileTextIcon },
      { href: "/skills/experience-letter",  label: "Experience Letter",  Icon: ScrollIcon },
      { href: "/skills/promotion-letter",   label: "Promotion Letter",   Icon: AwardIcon },
      { href: "/skills/resume-screener",    label: "Resume Screener",    Icon: BotIcon },
    ],
  },
  {
    title: "HR",
    items: [
      { href: "/policies", label: "Policies", Icon: SettingsIcon },
    ],
  },
];

// Flatten for the dock-style hover effect — we need a single global index
// so neighbouring items (across section boundaries) can also react.
const FLAT_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);

const STORAGE_KEY = "hr-bot-sidebar-collapsed";


export function Sidebar({ userName, userRole }: { userName?: string; userRole?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Dock-style hover: which flat-index item is the mouse over right now?
  // null when nothing is hovered.  Only applied when sidebar is collapsed.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Mobile drawer open/closed (md: breakpoint and below).
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      /* localStorage disabled — use default */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      // Reset hover state when toggling so we don't leak a stale label.
      setHoverIdx(null);
      return next;
    });
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /**
   * Dock-style scale: hovered item is 1.30, immediate neighbours 1.12,
   * one-further 1.04, then nothing.  Only active when collapsed.
   */
  const scaleFor = (idx: number): number => {
    if (!collapsed || hoverIdx === null) return 1;
    const d = Math.abs(idx - hoverIdx);
    if (d === 0) return 1.30;
    if (d === 1) return 1.12;
    if (d === 2) return 1.04;
    return 1;
  };

  // Compact nav used inside the mobile drawer (always expanded, no dock).
  const mobileNav = (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map((section) => (
        <div key={section.title} className="mb-6">
          <div className="px-3 mb-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            {section.title}
          </div>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.Icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                      active
                        ? "bg-[#fdf0ff] text-[#AE00D0] font-medium"
                        : "text-slate-600 hover:text-slate-900 hover:bg-stone-100",
                    )}
                  >
                    <Icon size={18} className={active ? "text-[#AE00D0]" : "text-slate-400"} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* ── Mobile top bar (md:hidden) — fixed, holds the hamburger ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-stone-200 flex items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="w-9 h-9 -ml-1 rounded-lg hover:bg-stone-100 flex items-center justify-center text-slate-600"
        >
          {/* hamburger */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <Link href="/" aria-label="Home">
          <Logo variant="wordmark" height={22} priority />
        </Link>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px]"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Mobile drawer panel ── */}
      <aside
        className={clsx(
          "md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-white border-r border-stone-200 flex flex-col shadow-xl transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Mobile navigation"
      >
        <div className="border-b border-stone-200 flex items-center justify-between px-4 py-4">
          <Link href="/" aria-label="Home" onClick={() => setMobileOpen(false)}>
            <Logo variant="wordmark" height={24} priority />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="w-8 h-8 rounded-md hover:bg-stone-100 flex items-center justify-center text-slate-500"
          >
            ✕
          </button>
        </div>
        {mobileNav}
        <div className="px-4 py-3 border-t border-stone-200 text-xs">
          <div className="text-slate-500">Signed in as</div>
          <div className="text-slate-900 font-medium mt-0.5 truncate">{userName ?? "—"}</div>
          <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">{userRole ?? "viewer"}</div>
        </div>
      </aside>

      {/* ── Desktop sidebar (md+) — collapsible with dock hover ── */}
      <aside
        className={clsx(
          "hidden md:flex shrink-0 bg-white border-r border-stone-200 min-h-screen flex-col sticky top-0 z-30 transition-[width] duration-200 ease-out",
          collapsed ? "w-[72px]" : "w-64",
        )}
        aria-label="Main navigation"
        onMouseLeave={() => setHoverIdx(null)}
      >
      {/* Brand + collapse toggle */}
      <div className={clsx(
        "border-b border-stone-200 flex items-center gap-2",
        collapsed ? "px-2 py-4 justify-center flex-col" : "px-4 py-4 justify-between",
      )}>
        <Link
          href="/"
          className="block group min-w-0"
          aria-label="Home"
        >
          {collapsed ? (
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#AE00D0] to-[#7B5AFF] text-white font-bold text-base shadow-sm shadow-violet-200/50">
              H
            </span>
          ) : (
            <>
              <Logo variant="wordmark" height={26} priority />
              <div className="mt-1.5 text-[10px] text-slate-500 uppercase tracking-[0.18em]">
                HR Bot · People Ops
              </div>
            </>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "flex-none rounded-md hover:bg-stone-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors",
            collapsed ? "w-7 h-7 mt-1" : "w-7 h-7",
          )}
        >
          {collapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className={clsx(
        "flex-1 overflow-y-auto overflow-x-visible",
        collapsed ? "py-3 px-2" : "py-4 px-3",
      )}>
        {NAV.map((section, sIdx) => {
          // Index offset for this section in the flat list (for dock hover).
          const offset = NAV.slice(0, sIdx).reduce((n, s) => n + s.items.length, 0);
          return (
            <div key={section.title} className={collapsed ? "mb-2" : "mb-6"}>
              {!collapsed && (
                <div className="px-3 mb-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  {section.title}
                </div>
              )}
              {collapsed && sIdx > 0 && (
                <div className="mx-3 mb-2.5 mt-1 border-t border-stone-100" />
              )}
              <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
                {section.items.map((item, iIdx) => {
                  const flat = offset + iIdx;
                  const active = isActive(item.href);
                  const isHover = hoverIdx === flat;
                  const scale = scaleFor(flat);
                  const Icon = item.Icon;
                  if (collapsed) {
                    return (
                      <li
                        key={item.href}
                        className="relative"
                        onMouseEnter={() => setHoverIdx(flat)}
                      >
                        <Link
                          href={item.href}
                          aria-label={item.label}
                          className={clsx(
                            "flex items-center justify-center mx-auto rounded-xl transition-all duration-200 ease-out will-change-transform",
                            "w-12 h-11",
                            active
                              ? "bg-gradient-to-br from-[#fdf0ff] to-[#f6e7ff] text-[#AE00D0] shadow-sm shadow-violet-100"
                              : "text-slate-500 hover:text-[#AE00D0] hover:bg-stone-50",
                          )}
                          style={{
                            transform: `scale(${scale})`,
                            transformOrigin: "center",
                          }}
                        >
                          <Icon size={20} />
                        </Link>
                        {/* Dock-style flyout label.  Appears just to the
                            right of the hovered icon, not overlapping
                            the next icon vertically. */}
                        {isHover && (
                          <span
                            className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg shadow-slate-900/20"
                          >
                            {/* Little arrow nub */}
                            <span className="absolute right-full top-1/2 -translate-y-1/2 mr-[-1px] block w-0 h-0
                                             border-t-[5px] border-b-[5px] border-r-[5px]
                                             border-t-transparent border-b-transparent border-r-slate-900" />
                            {item.label}
                          </span>
                        )}
                      </li>
                    );
                  }
                  // Expanded layout — original look, no dock effect.
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={clsx(
                          "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                          active
                            ? "bg-[#fdf0ff] text-[#AE00D0] font-medium"
                            : "text-slate-600 hover:text-slate-900 hover:bg-stone-100",
                        )}
                      >
                        <Icon size={18} className={active ? "text-[#AE00D0]" : "text-slate-400 group-hover:text-slate-600"} />
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
          );
        })}
      </nav>

      {/* Footer / signed-in user */}
      <div className={clsx(
        "border-t border-stone-200 text-xs",
        collapsed ? "px-2 py-3" : "px-4 py-3",
      )}>
        {collapsed ? (
          <div
            title={`${userName ?? "—"} · ${userRole ?? "viewer"}`}
            className="mx-auto w-10 h-10 rounded-full bg-gradient-to-br from-[#AE00D0] to-[#7B5AFF] text-white font-bold flex items-center justify-center text-sm shadow-sm"
          >
            {(userName ?? "U").charAt(0).toUpperCase()}
          </div>
        ) : (
          <>
            <div className="text-slate-500">Signed in as</div>
            <div className="text-slate-900 font-medium mt-0.5 truncate">
              {userName ?? "—"}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">
              {userRole ?? "viewer"}
            </div>
          </>
        )}
      </div>
      </aside>
    </>
  );
}
