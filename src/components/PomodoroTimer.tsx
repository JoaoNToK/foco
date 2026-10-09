"use client";

import { useEffect, useState } from "react";
import { CalendarClock, ChevronDown, Maximize, Minimize, Pause, Play, RotateCcw } from "lucide-react";
import { useStore } from "@/store/useStore";
import { unlockAudio } from "@/lib/audio";
import { currentEvent } from "@/lib/calendar";
import type { Phase } from "@/lib/types";
import SubjectPicker from "./SubjectPicker";

const R = 148;
const C = 2 * Math.PI * R;

const fmt = (ms: number, forceHours = false) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 || forceHours ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const PHASES: { id: Phase; label: string }[] = [
  { id: "focus", label: "Foco" },
  { id: "short", label: "Pausa curta" },
  { id: "long", label: "Pausa longa" },
];

export default function PomodoroTimer() {
  const mode = useStore((s) => s.mode);
  const phase = useStore((s) => s.phase);
  const status = useStore((s) => s.status);
  const cycles = useStore((s) => s.cycles);
  const subject = useStore((s) => s.subject);
  const planned = useStore((s) => s.plannedMs);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.calendarEvents);
  const store = useStore.getState;

  const [now, setNow] = useState(0);
  const [openAdjust, setOpenAdjust] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Re-render + checagem de término. O tempo vem de timestamps (Date.now()),
  // então um setInterval "estrangulado" pelo navegador não causa atraso.
  useEffect(() => {
    setNow(Date.now());
    if (status !== "running") return;
    const update = () => {
      setNow(Date.now());
      store().tick();
    };
    const id = setInterval(update, 250);
    const vis = () => document.visibilityState === "visible" && update();
    document.addEventListener("visibilitychange", vis);
    update();
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [status, store]);

  // Atalho de teclado: Barra de espaço para play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.hasAttribute("contenteditable"))) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        const currentStatus = store().status;
        if (currentStatus === "running") {
          store().pause();
        } else {
          unlockAudio();
          store().start();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  const isTimer = mode === "timer";
  const remaining = isTimer ? (now === 0 ? planned : store().getRemaining(now)) : 0;
  const elapsed = !isTimer ? (now === 0 ? 0 : store().getElapsed(now)) : 0;
  const display = isTimer ? fmt(remaining) : fmt(elapsed, elapsed >= 3_600_000);
  const hasHours = display.split(":").length === 3;

  // título da aba mostra o tempo
  useEffect(() => {
    document.title = status === "idle" ? "foco." : `${display} · foco.`;
  }, [display, status]);

  const progress = isTimer
    ? Math.min(1, Math.max(0, remaining / Math.max(planned, 1)))
    : (elapsed % 60_000) / 60_000;
  const dash = isTimer ? C * (1 - progress) : C * (1 - progress);
  const evt = currentEvent(events, now);

  const onStart = () => {
    unlockAudio(); // <- gesto do usuário: libera o AudioContext (anti-autoplay)
    store().start();
  };

  const phaseLabel = PHASES.find((p) => p.id === phase)?.label;

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-bg p-6 landscape:flex-row landscape:gap-16">
        <button
          onClick={toggleFullscreen}
          className="absolute right-6 top-6 z-[101] rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-fg"
          aria-label="Sair da tela cheia"
        >
          <Minimize size={24} />
        </button>

        <div className="relative mx-auto flex aspect-square w-[min(90vw,90vh,450px)] items-center justify-center [container-type:inline-size]">
          <svg viewBox="0 0 340 340" className="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="170" cy="170" r={R} fill="none" stroke="var(--line)" strokeWidth="3" />
            <circle
              cx="170"
              cy="170"
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={dash}
              style={{ transition: status === "running" ? "stroke-dashoffset 0.3s linear" : "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <div className="z-10 flex flex-col items-center text-center">
            <span
              className={`tabular whitespace-nowrap font-light leading-none tracking-tight ${
                hasHours ? "text-[15cqw]" : "text-[22cqw]"
              } ${status === "paused" ? "pulse-soft" : ""}`}
            >
              {display}
            </span>
            <span className="mt-2 text-sm uppercase tracking-[0.2em] text-muted">
              {isTimer ? phaseLabel : "progressivo"}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 landscape:flex-col sm:flex-row">
          {status === "running" ? (
            <button
              onClick={() => store().pause()}
              className="flex items-center gap-3 rounded-full border border-accent px-10 py-4 text-lg font-medium text-accent transition hover:bg-accent/10"
            >
              <Pause size={24} /> Pausar
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex items-center gap-3 rounded-full bg-accent px-10 py-4 text-lg font-medium text-accent-fg shadow-lg shadow-accent/20 transition hover:scale-[1.03] hover:brightness-110 active:scale-95"
            >
              <Play size={24} fill="currentColor" /> {status === "paused" ? "Continuar" : "Iniciar"}
            </button>
          )}
          <button
            onClick={() => store().reset()}
            className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-line text-muted transition hover:border-fg hover:text-fg"
            aria-label="Reiniciar"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="fade-up mx-auto flex w-full max-w-xl flex-col items-center gap-7" aria-label="Timer">
      {/* Sub-abas */}
      <div className="flex rounded-full border border-line bg-surface p-1 text-sm">
        {(["timer", "stopwatch"] as const).map((m) => (
          <button
            key={m}
            id={`mode-${m}`}
            onClick={() => store().setMode(m)}
            className={`rounded-full px-5 py-1.5 transition ${
              mode === m ? "bg-fg text-bg" : "text-muted hover:text-fg"
            }`}
          >
            {m === "timer" ? "Timer" : "Cronômetro"}
          </button>
        ))}
      </div>

      {isTimer && (
        <div className="flex flex-wrap justify-center gap-2">
          {PHASES.map((p) => (
            <button
              key={p.id}
              id={`phase-${p.id}`}
              onClick={() => store().setPhase(p.id)}
              className={`rounded-lg px-4 py-1.5 text-sm transition ${
                phase === p.id
                  ? "bg-accent/15 text-accent ring-1 ring-accent/50"
                  : "text-muted hover:bg-surface2 hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Mostrador */}
      <div className="relative mx-auto aspect-square w-[min(86vw,340px)] [container-type:inline-size]">
        <svg viewBox="0 0 340 340" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="170" cy="170" r={R} fill="none" stroke="var(--line)" strokeWidth="2" />
          <circle
            cx="170"
            cy="170"
            r={R}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dash}
            style={{ transition: status === "running" ? "stroke-dashoffset 0.3s linear" : "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            id="time-display"
            className={`tabular whitespace-nowrap font-light leading-none tracking-tight ${
              hasHours ? "text-[15cqw]" : "text-[22cqw]"
            } ${status === "paused" ? "pulse-soft" : ""}`}
            aria-live="off"
          >
            {display}
          </span>
          <span className="mt-1 text-xs uppercase tracking-[0.2em] text-muted">
            {isTimer ? phaseLabel : "progressivo"}
          </span>
        </div>
      </div>

      {/* Matéria */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted">
          Estudando: <span className="font-medium text-fg">{subject}</span>
        </p>
        <SubjectPicker />
        {evt && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock size={13} className="text-accent" /> Agora no calendário: {evt.summary}
          </p>
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {status === "running" ? (
          <button
            id="pause-btn"
            onClick={() => store().pause()}
            className="flex items-center gap-2 rounded-full border border-accent px-8 py-3 font-medium text-accent transition hover:bg-accent/10"
          >
            <Pause size={18} /> Pausar
          </button>
        ) : (
          <button
            id="start-btn"
            onClick={onStart}
            className="flex items-center gap-2 rounded-full bg-accent px-8 py-3 font-medium text-accent-fg shadow-lg shadow-accent/20 transition hover:scale-[1.03] hover:brightness-110 active:scale-95"
          >
            <Play size={18} fill="currentColor" /> {status === "paused" ? "Continuar" : "Iniciar"}
          </button>
        )}
        {isTimer && (
          <button
            id="plus-minute-btn"
            onClick={() => store().addMinute()}
            disabled={status === "idle"}
            className="rounded-full border border-line px-5 py-3 text-sm text-muted transition hover:border-fg hover:text-fg disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
          >
            + 1:00
          </button>
        )}
        <button
          id="reset-btn"
          onClick={() => store().reset()}
          className="flex items-center gap-2 rounded-full border border-line px-5 py-3 text-sm text-muted transition hover:border-fg hover:text-fg"
        >
          <RotateCcw size={15} /> Reiniciar
        </button>
        <button
          onClick={toggleFullscreen}
          className="flex items-center justify-center rounded-full border border-line px-4 py-3 text-sm text-muted transition hover:border-fg hover:text-fg"
          aria-label="Tela cheia"
        >
          <Maximize size={15} />
        </button>
      </div>

      <p className="text-sm text-muted" id="cycles-count">
        <span className="font-medium text-fg">{cycles}</span> ciclos concluídos nesta sessão
      </p>

      {/* Ajustar tempos */}
      {isTimer && (
        <div className="w-full max-w-sm">
          <button
            id="adjust-times-btn"
            onClick={() => setOpenAdjust((o) => !o)}
            className="mx-auto flex items-center gap-1 text-sm text-muted transition hover:text-fg"
          >
            Ajustar tempos (minutos)
            <ChevronDown size={14} className={`transition ${openAdjust ? "rotate-180" : ""}`} />
          </button>
          {openAdjust && (
            <div className="fade-up mt-3 grid grid-cols-3 gap-3 rounded-xl border border-line bg-surface p-4">
              <MinuteInput id="adj-focus" label="Foco" value={settings.focusMin} onChange={(v) => store().updateSettings({ focusMin: v })} />
              <MinuteInput id="adj-short" label="Curta" value={settings.shortMin} onChange={(v) => store().updateSettings({ shortMin: v })} />
              <MinuteInput id="adj-long" label="Longa" value={settings.longMin} onChange={(v) => store().updateSettings({ longMin: v })} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function MinuteInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        id={id}
        type="number"
        min={1}
        max={180}
        value={value}
        onChange={(e) => {
          const v = Math.min(180, Math.max(1, Number(e.target.value) || 1));
          onChange(v);
        }}
        className="tabular rounded-lg border border-line bg-bg px-3 py-2 text-base text-fg outline-none focus:border-accent"
      />
    </label>
  );
}
