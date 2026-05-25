"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Point = { week_start: string; avg_score: number; reviewed: number };

export function TrendChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-12 text-center">
        No trend data yet.
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
          <XAxis
            dataKey="week_start"
            stroke="#94a3b8"
            tickFormatter={(v: string) => v.slice(5)}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
          />
          <YAxis
            stroke="#94a3b8"
            domain={[0, 100]}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e7e5e4",
              borderRadius: 10,
              color: "#0f172a",
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
            }}
            labelStyle={{ color: "#64748b", fontSize: 11 }}
            formatter={(value: number) => [`${value}%`, "Avg score"]}
          />
          <Line
            type="monotone"
            dataKey="avg_score"
            stroke="#AE00D0"
            strokeWidth={2}
            dot={{ fill: "#AE00D0", r: 3 }}
            activeDot={{ r: 5, fill: "#7B5AFF" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
