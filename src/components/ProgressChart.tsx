"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "@/store/useStore";
import type { Session } from "@/lib/types";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const startOfLocalDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/**
 * Anti-bug #3 (fuso): `started_at` vem em UTC (ISO). new Date(iso) + getters locais
 * (setHours/getDay) agrupam pelo DIA LOCAL do usuário, nunca pelo dia UTC.
 */
export function aggregate(sessions: Session[], weekOffset: number = 0, today = new Date()) {
  const base = startOfLocalDay(today);
  
  const targetDate = new Date(base);
  targetDate.setDate(base.getDate() + weekOffset * 7);
  
  const weekStart = new Date(targetDate);
  weekStart.setDate(targetDate.getDate() - targetDate.getDay());
  
  const minutes = new Array(7).fill(0) as number[];
  const bySubject = new Map<string, number>();
  let totalWeekMin = 0;
  let todayMin = 0;

  for (const s of sessions) {
    const local = new Date(s.started_at);
    const dayStart = startOfLocalDay(local);
    const min = s.duration_sec / 60;
    
    // Calcula para a semana visível
    const diff = Math.round((dayStart.getTime() - weekStart.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) {
      minutes[diff] += min;
      totalWeekMin += min;
      bySubject.set(s.subject, (bySubject.get(s.subject) ?? 0) + min);
    }
    
    // Calcula para hoje (independente da semana visível)
    if (dayStart.getTime() === base.getTime()) {
      todayMin += min;
    }
  }

  return {
    todayMin: Math.round(todayMin),
    totalWeekMin: Math.round(totalWeekMin),
    todayIdx: weekOffset === 0 ? base.getDay() : -1,
    chart: DAYS.map((d, i) => ({ day: d, min: Math.round(minutes[i]) })),
    subjects: [...bySubject.entries()]
      .map(([name, m]) => ({ name, min: Math.round(m) }))
      .sort((a, b) => b.min - a.min),
  };
}

export default function ProgressChart() {
  const allSessions = useStore((s) => s.sessions);
  const userId = useStore((s) => s.userId);
  const sessions = useMemo(() => allSessions.filter((s) => !s.deleted_at && (!s.user_id || s.user_id === userId)), [allSessions, userId]);
  const dailyGoalMin = useStore((s) => s.settings.dailyGoalMin || 120);
  const [weekOffset, setWeekOffset] = useState(0);
  
  const data = useMemo(() => aggregate(sessions, weekOffset), [sessions, weekOffset]);
  const max = Math.max(1, ...data.subjects.map((s) => s.min));

  return (
    <section className="fade-up mx-auto w-full max-w-2xl" aria-label="Progresso">
      <h2 className="text-3xl font-light" id="today-heading">
        Hoje: <span className="font-semibold text-accent">{data.todayMin} min</span> de foco
      </h2>

      <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">
            {weekOffset === 0 ? "Esta semana" : weekOffset === -1 ? "Semana passada" : weekOffset > 0 ? `Semana +${weekOffset}` : `Semana ${weekOffset}`} 
            <span className="ml-2 font-medium">({data.totalWeekMin} min)</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-bg transition hover:bg-surface2"
            >
              <ChevronLeft size={14} />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-xs font-medium text-muted hover:text-fg px-2"
              >
                Hoje
              </button>
            )}
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-bg transition hover:bg-surface2"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.chart} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--fg)" }}
                formatter={(v) => [`${v} min`, "Foco"]}
              />
              <ReferenceLine y={dailyGoalMin} stroke="var(--accent)" strokeDasharray="3 3" opacity={0.5} />
              <Bar dataKey="min" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {data.chart.map((_, i) => (
                  <Cell key={i} fill={i === data.todayIdx ? "var(--accent)" : "var(--line)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <h3 className="mb-3 mt-8 text-xs uppercase tracking-[0.18em] text-muted">Por matéria</h3>
      {data.subjects.length === 0 ? (
        <p className="text-sm text-muted">Nenhum estudo registrado ainda. Conclua um foco para começar.</p>
      ) : (
        <ul className="space-y-2">
          {data.subjects.map((s) => (
            <li key={s.name} className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex justify-between text-sm">
                <span>{s.name}</span>
                <span className="tabular text-muted">{s.min} min</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(s.min / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
