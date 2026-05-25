"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type EmployeeSnapshotPoint = {
  label: string;             // X-axis label (e.g. "May 13 10am")
  tickets_pct: number | null; // 0..100
  sp_pct: number | null;      // 0..100
  cycle_name: string;
};

export function EmployeeTrendChart({ data }: { data: EmployeeSnapshotPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-12 text-center">
        No snapshots yet for this employee.
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 24, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
          />
          <YAxis
            stroke="#94a3b8"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e7e5e4",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
            }}
            formatter={(value: number, name: string) => [`${value}%`, name]}
            labelFormatter={(label, items) => {
              const p = items?.[0]?.payload as EmployeeSnapshotPoint | undefined;
              return p?.cycle_name ? `${p.cycle_name} · ${label}` : label;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="tickets_pct"
            name="Tickets %"
            stroke="#AE00D0"
            strokeWidth={2}
            dot={{ r: 4, fill: "#AE00D0" }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="sp_pct"
            name="Story points %"
            stroke="#7B5AFF"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3, fill: "#7B5AFF" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
