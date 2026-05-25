"use client";

import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export function TierPie({
  full,
  partial,
  oneOnOne,
  growth,
}: {
  full: number;
  partial: number;
  oneOnOne: number;
  growth: number;
}) {
  const data = [
    { name: "Full bonus",    value: full,     color: "#059669" },
    { name: "Partial bonus", value: partial,  color: "#d97706" },
    { name: "Manager 1:1",   value: oneOnOne, color: "#2563eb" },
    { name: "Growth plan",   value: growth,   color: "#e11d48" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-12 text-center">
        No tier data yet.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e7e5e4",
              borderRadius: 10,
              color: "#0f172a",
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(15,23,42,0.06)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: 11, color: "#64748b" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
