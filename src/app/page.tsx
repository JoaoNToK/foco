"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { useStore } from "@/store/useStore";
import type { TabId } from "@/lib/types";
import PomodoroTimer from "@/components/PomodoroTimer";
import NotesPanel from "@/components/NotesPanel";
import TasksPanel from "@/components/TasksPanel";
import ProgressChart from "@/components/ProgressChart";
import SettingsModal from "@/components/SettingsModal";
import CalendarPanel from "@/components/CalendarPanel";

const TABS: { id: TabId; label: string }[] = [
  { id: "timer", label: "Timer" },
  { id: "notes", label: "Anotações" },
  { id: "reminders", label: "Lembretes" },
  { id: "calendar", label: "Calendário" },
  { id: "progress", label: "Progresso" },
];

export default function Home() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5 sm:py-4" aria-label="Principal">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <img src="/icon.png" alt="Logo" className="h-6 w-auto" />
            foco<span className="text-accent">.</span>
          </h1>
          <ul className="-mx-1 flex flex-wrap items-center justify-center gap-0.5 text-[13px] sm:mx-0 sm:justify-end sm:gap-2 sm:text-sm">
            {TABS.map((t) => (
              <li key={t.id}>
                <button
                  id={`tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-2.5 py-1.5 transition sm:px-3 ${
                    tab === t.id ? "bg-surface2 text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            ))}
            <li>
              <button
                id="open-settings"
                aria-label="Configurações"
                onClick={() => setSettingsOpen(true)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:rotate-45 hover:text-fg"
              >
                <Settings size={18} />
              </button>
            </li>
          </ul>
        </nav>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-5 sm:py-14">
        {tab === "timer" && <PomodoroTimer />}
        {tab === "notes" && <NotesPanel />}
        {tab === "reminders" && <TasksPanel />}
        {tab === "progress" && <ProgressChart />}
        {tab === "calendar" && <CalendarPanel />}
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
