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

export type AdminTrendPoint = {
  day: string;
  visitors: number;
  signups: number;
};

export function AdminTrendChart({ data }: { data: AdminTrendPoint[] }) {
  const rows = data.map((r) => ({
    ...r,
    label: r.day.slice(5).replace("-", "/"),
  }));

  return (
    <div className="h-[min(320px,55vw)] w-full min-h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={36}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
            formatter={(value, name) =>
              name === "visitors"
                ? [`${value}명`, "방문 (일 고유)"]
                : [`${value}명`, "가입"]
            }
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { day?: string };
              return row?.day ?? "";
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v) => (v === "visitors" ? "방문(고유)" : "가입")}
          />
          <Line
            type="monotone"
            dataKey="visitors"
            name="visitors"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="signups"
            name="signups"
            stroke="#059669"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
