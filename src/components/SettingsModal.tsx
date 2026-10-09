"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { playAlarm, unlockAudio } from "@/lib/audio";
import { signInWithGoogle, signOut, supabase } from "@/lib/supabase";
import { MinuteInput } from "./PomodoroTimer";
import type { AlarmSound } from "@/lib/types";

function Toggle({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-t border-line py-5 first:border-0 first:pt-0">
    <h3 className="mb-3 text-xs uppercase tracking-[0.18em] text-muted">{title}</h3>
    <div className="space-y-4">{children}</div>
  </div>
);

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const userEmail = useStore((s) => s.userEmail);
  const providerToken = useStore((s) => s.providerToken);
  const subjects = useStore((s) => s.subjects);
  const addSubject = useStore((s) => s.addSubject);
  const deleteSubject = useStore((s) => s.deleteSubject);
  const [newSubject, setNewSubject] = useState("");
  // false no servidor/hidratação, true no cliente (sem setState em effect)
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;
  const dark = (mounted ? resolvedTheme ?? theme : "dark") === "dark";
  const connected = !!userEmail && !!providerToken;

  const connect = async () => {
    try {
      await signInWithGoogle();
    } catch {
      toast.warning("Não foi possível conectar ao Google. Configure o Supabase (.env.local).");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        onClick={(e) => e.stopPropagation()}
        className="fade-up max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-medium">Configurações</h2>
          <button id="close-settings" onClick={onClose} aria-label="Fechar" className="text-muted hover:text-fg">
            <X size={18} />
          </button>
        </div>

        <Section title="Tema">
          <div className="flex items-center justify-between text-sm">
            <span>Modo escuro</span>
            <Toggle id="theme-toggle" label="Modo escuro" checked={dark} onChange={(v) => setTheme(v ? "dark" : "light")} />
          </div>
        </Section>

        <Section title="Sons e alertas">
          <div className="flex items-center justify-between text-sm">
            <span>Notificações do sistema</span>
            <Toggle 
              id="notifications-toggle" 
              label="Notificações" 
              checked={settings.notificationsEnabled} 
              onChange={(v) => {
                if (v && "Notification" in window) {
                  Notification.requestPermission().then(perm => {
                    update({ notificationsEnabled: perm === "granted" });
                  });
                } else {
                  update({ notificationsEnabled: false });
                }
              }} 
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Alarme ativado</span>
            <Toggle id="sound-toggle" label="Alarme" checked={settings.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">
            Volume
            <input
              id="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              className="w-40 accent-[var(--accent)]"
            />
          </label>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Som</span>
            <div className="flex gap-2">
              <select
                id="alarm-select"
                value={settings.alarm}
                onChange={(e) => update({ alarm: e.target.value as AlarmSound })}
                className="rounded-lg border border-line bg-bg px-3 py-1.5 outline-none focus:border-accent"
              >
                <option value="bell">Sino</option>
                <option value="digital">Digital</option>
                <option value="beep">Bipe</option>
              </select>
              <button
                id="test-sound-btn"
                onClick={() => {
                  unlockAudio();
                  playAlarm(settings.alarm, settings.volume);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-muted hover:border-accent hover:text-accent"
              >
                Testar
              </button>
            </div>
          </div>
        </Section>

        <Section title="Matérias">
          <div className="mb-3 flex flex-wrap gap-2">
            {subjects.map((sub) => (
              <span key={sub} className="flex items-center gap-1 rounded bg-bg px-2 py-1 text-xs border border-line">
                {sub}
                {sub !== "Geral" && (
                  <button onClick={() => deleteSubject(sub)} aria-label={`Excluir ${sub}`} className="text-muted hover:text-red-500">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newSubject.trim()) {
                addSubject(newSubject);
                setNewSubject("");
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Nova matéria..."
              className="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button type="submit" className="rounded-lg bg-surface2 px-3 py-1.5 text-sm transition hover:bg-line border border-line">
              Adicionar
            </button>
          </form>
        </Section>

        <Section title="Tempos e Metas (min)">
          <div className="grid grid-cols-3 gap-3">
            <MinuteInput id="set-focus" label="Foco" value={settings.focusMin} onChange={(v) => update({ focusMin: v })} />
            <MinuteInput id="set-short" label="Pausa curta" value={settings.shortMin} onChange={(v) => update({ shortMin: v })} />
            <MinuteInput id="set-long" label="Pausa longa" value={settings.longMin} onChange={(v) => update({ longMin: v })} />
          </div>
          <div className="mt-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Meta diária de foco
              <input
                id="set-daily-goal"
                type="number"
                min={1}
                max={1440}
                value={settings.dailyGoalMin || 120}
                onChange={(e) => {
                  const v = Math.min(1440, Math.max(1, Number(e.target.value) || 120));
                  update({ dailyGoalMin: v });
                }}
                className="tabular rounded-lg border border-line bg-bg px-3 py-2 text-base text-fg outline-none focus:border-accent"
              />
            </label>
          </div>
        </Section>

        <Section title="Calendário">
          <p className="text-sm text-muted">
            {connected ? `Conectado como ${userEmail}` : userEmail ? "Sessão do Google expirou — reconecte." : "Google Calendar não conectado."}
          </p>
          <div className="flex items-center justify-between text-sm">
            <span>Salvar sessões concluídas no calendário</span>
            <Toggle id="autosave-toggle" label="Salvar no calendário" checked={settings.autoSaveCalendar} onChange={(v) => update({ autoSaveCalendar: v })} />
          </div>
          {connected ? (
            <button
              id="disconnect-google"
              onClick={async () => {
                await signOut();
                useStore.getState().setAuth(null, null);
              }}
              className="w-full rounded-lg border border-line py-2 text-sm hover:border-fg"
            >
              Desconectar Google Calendar
            </button>
          ) : (
            <button
              id="connect-google"
              onClick={connect}
              disabled={!supabase && false}
              className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg hover:brightness-110"
            >
              Conectar Google Calendar
            </button>
          )}
        </Section>
      </div>
    </div>
  );
}
