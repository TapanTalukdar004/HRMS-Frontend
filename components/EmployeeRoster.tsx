"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EmployeeRow } from "@/lib/queries";
import { tierChipClass, formatScore } from "@/lib/tiers";
import { clsx } from "@/lib/cn";

type Props = {
  rows: EmployeeRow[];
  /** Show the email column (default true on /employees, false on /dashboard for compactness) */
  showEmail?: boolean;
  /** Show the employee_id column (HR-friendly identifier for cross-checking) */
  showEmpId?: boolean;
};

export function EmployeeRoster({
  rows,
  showEmail = true,
  showEmpId = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string>("");
  const [designation, setDesignation] = useState<string>("");

  // Build sorted distinct option lists from the data
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.department) set.add(r.department);
    return Array.from(set).sort();
  }, [rows]);

  const designations = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const d = r.designation ?? r.role;
      if (d) set.add(d);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (department && r.department !== department) return false;
      const role = r.designation ?? r.role ?? "";
      if (designation && role !== designation) return false;
      if (!q) return true;
      const haystack = [
        r.name,
        r.first_name,
        r.email ?? "",
        r.id,
        r.emp_id ?? "",
        r.department ?? "",
        role,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, department, designation]);

  const hasFilter = query !== "" || department !== "" || designation !== "";

  return (
    <div>
      {/* Filter bar */}
      <div className="px-6 py-4 border-y border-stone-200 bg-stone-50/40 grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-5">
          <label className="block">
            <span className="sr-only">Search</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                {/* magnifying glass — inline SVG to avoid an icon dep */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, ID..."
                className="w-full bg-white border border-stone-200 rounded-lg pl-9 pr-3 py-2 text-sm
                           text-slate-900 placeholder:text-slate-400
                           focus:outline-none focus:ring-2 focus:ring-[#AE00D0] focus:border-[#AE00D0]
                           hover:border-stone-300 transition shadow-sm"
              />
            </div>
          </label>
        </div>

        <div className="sm:col-span-3">
          <Select
            label="Department"
            value={department}
            onChange={setDepartment}
            options={departments}
          />
        </div>

        <div className="sm:col-span-3">
          <Select
            label="Designation"
            value={designation}
            onChange={setDesignation}
            options={designations}
          />
        </div>

        <div className="sm:col-span-1 flex items-center justify-end">
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDepartment("");
                setDesignation("");
              }}
              className="text-xs font-medium text-slate-500 hover:text-[#AE00D0] px-2 py-1.5 rounded-md transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      <div className="px-6 py-2 text-xs text-slate-500 border-b border-stone-200 bg-stone-50/40">
        Showing <span className="font-mono tabular-nums text-slate-700">{filtered.length}</span>{" "}
        of <span className="font-mono tabular-nums text-slate-700">{rows.length}</span>
        {hasFilter ? " (filtered)" : ""}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left bg-stone-50/40">
            <tr>
              <Th>Employee</Th>
              {showEmpId && <Th>Emp ID</Th>}
              <Th>Department</Th>
              <Th>Role</Th>
              {showEmail && <Th>Email</Th>}
              <Th>Latest week</Th>
              <Th align="right">Score</Th>
              <Th>Tier</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5 + (showEmail ? 1 : 0) + (showEmpId ? 1 : 0)}
                  className="py-12 px-6 text-center text-sm text-slate-400"
                >
                  No employees match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-stone-100 hover:bg-stone-50 transition"
                >
                  <td className="py-3 px-6">
                    <Link
                      href={`/employees/${e.id}`}
                      className="text-[#AE00D0] hover:text-[#7B5AFF] font-medium"
                    >
                      {e.name}
                    </Link>
                  </td>
                  {showEmpId && (
                    <td className="py-3 px-6 font-mono text-xs text-slate-500">
                      {e.emp_id ?? "—"}
                    </td>
                  )}
                  <td className="py-3 px-6 text-slate-600">{e.department ?? "—"}</td>
                  <td className="py-3 px-6 text-slate-600">
                    {e.designation ?? e.role ?? "—"}
                  </td>
                  {showEmail && (
                    <td className="py-3 px-6 text-slate-500 text-xs font-mono">
                      {e.email ?? "—"}
                    </td>
                  )}
                  <td className="py-3 px-6 text-slate-500">{e.latest_week ?? "—"}</td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-900">
                    {formatScore(e.latest_score)}
                  </td>
                  <td className="py-3 px-6">
                    {e.latest_tier ? (
                      <span
                        className={clsx(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                          tierChipClass(e.latest_tier),
                        )}
                      >
                        {e.latest_tier}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm
                   text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#AE00D0]
                   focus:border-[#AE00D0] hover:border-stone-300 transition shadow-sm
                   cursor-pointer"
      >
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={clsx(
        "py-3 px-6 font-medium text-[11px] uppercase tracking-wider text-slate-500",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
