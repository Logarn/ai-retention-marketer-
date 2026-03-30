"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function SegmentPieChart({
  data,
}: {
  data: Array<{ key: string; label: string; count: number; color: string }>;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="count" nameKey="label" outerRadius={100}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.26)",
              background: "rgba(11,15,24,0.95)",
              color: "#e5e7eb",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChannelBarChart({
  data,
}: {
  data: Array<{ channel: string; revenue: number }>;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
          <XAxis dataKey="channel" stroke="rgba(148,163,184,0.85)" tickLine={false} axisLine={false} />
          <YAxis stroke="rgba(148,163,184,0.85)" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.26)",
              background: "rgba(11,15,24,0.95)",
              color: "#e5e7eb",
            }}
          />
          <Bar dataKey="revenue" fill="#ff7b42" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
