"use client";

import { SERIE_1, SERIE_2 } from "./palette";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";


const anim = { animationDuration: 700, animationEasing: "ease-out" as const };
const axis = { stroke: "rgba(27,26,26,0.45)", fontSize: 11 };
const tooltipStyle = {
  contentStyle: { background: "rgba(27,26,26,0.94)", border: "1px solid rgba(248,241,231,0.08)", borderRadius: 8, fontSize: 12, color: "#f8f1e7", boxShadow: "0 16px 40px -16px rgba(27,26,26,0.5)" },
  labelStyle: { color: "#f8f1e7", fontWeight: 600 },
  itemStyle: { color: "#f8f1e7" },
};

export function EvolucaoChart({ data }: { data: { semana: string; criadas: number; ganhas: number }[] }) {
  const fmt = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="g-criadas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIE_1} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIE_1} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-ganhas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIE_2} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIE_2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(27,26,26,0.08)" vertical={false} />
          <XAxis dataKey="semana" tickFormatter={fmt} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} labelFormatter={(l) => `Semana de ${fmt(String(l))}`} cursor={{ stroke: "rgba(27,26,26,0.25)" }} />
          <Area type="monotone" dataKey="criadas" name="Oportunidades criadas" stroke={SERIE_1} strokeWidth={2} fill="url(#g-criadas)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fffdf9" }} {...anim} />
          <Area type="monotone" dataKey="ganhas" name="Ganhas" stroke={SERIE_2} strokeWidth={2} fill="url(#g-ganhas)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fffdf9" }} {...anim} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UfChart({ data }: { data: { uf: string; n: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data.slice(0, 12)} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="rgba(27,26,26,0.08)" vertical={false} />
          <XAxis dataKey="uf" tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(27,26,26,0.05)" }} formatter={(v) => [v, "Oportunidades"]} />
          <Bar dataKey="n" fill={SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={28} {...anim} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
