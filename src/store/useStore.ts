import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import type {
  CalendarEvent,
  CalendarEntry,
  CalendarTag,
  Note,
  Phase,
  Session,
  Settings,
  Status,
  TabId,
  Task,
  TimerMode,
} from "@/lib/types";
import { playAlarm } from "@/lib/audio";
import { supabase } from "@/lib/supabase";
import {
  CalendarAuthError,
  createStudyEvent,
  currentEvent,
  fetchTodayEvents,
} from "@/lib/calendar";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const omit = <T extends object>(o: T, key: string) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  volume: 0.7,
  alarm: "bell",
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  autoSaveCalendar: false,
  notificationsEnabled: false,
  dailyGoalMin: 120,
};

interface State {
  tab: TabId;
  mode: TimerMode;
  phase: Phase;
  status: Status;
  /**
   * Anti-bug #1 (throttling): o tempo NUNCA é decrementado por tick.
   * Guardamos o instante-alvo (timestamp) e derivamos o restante com Date.now().
   */
  targetEnd: number | null; // timer rodando
  remainingMs: number | null; // timer pausado
  plannedMs: number; // total planejado da rodada atual (inclui +1:00)
  swStartedAt: number | null; // cronômetro rodando
  swAccMs: number; // cronômetro acumulado
  sessionStartedAt: number | null;
  cycles: number;
  subject: string;
  subjectManual: boolean;
  subjects: string[];
  settings: Settings;
  sessions: Session[];
  notes: Note[];
  tasks: Task[];
  userId: string | null;
  userEmail: string | null;
  providerToken: string | null;
  calendarEvents: CalendarEvent[];
  calendarEntries: CalendarEntry[];
  calendarTags: CalendarTag[];

  setTab: (t: TabId) => void;
  setMode: (m: TimerMode) => void;
  setPhase: (p: Phase) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  addMinute: () => void;
  tick: () => void;
  getRemaining: (now?: number) => number;
  getElapsed: (now?: number) => number;
  setSubject: (s: string, manual?: boolean) => void;
  addSubject: (s: string) => void;
  deleteSubject: (s: string) => void;
  updateSettings: (p: Partial<Settings>) => void;

  addNote: (content: string, subject: string | null) => void;
  deleteNote: (id: string) => void;
  addTask: (title: string, subject: string | null) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addCalendarEntry: (title: string, type: string, date: string) => void;
  deleteCalendarEntry: (id: string) => void;
  addCalendarTag: (label: string, color: string) => void;

  setAuth: (userId: string | null, email: string | null, token?: string | null) => void;
  refreshCalendar: () => Promise<void>;
  flushPending: () => Promise<void>;
  loadRemote: () => Promise<void>;
}

const phaseMs = (s: Settings, p: Phase) =>
  (p === "focus" ? s.focusMin : p === "short" ? s.shortMin : s.longMin) * 60_000;

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Registra sessão: salva local (synced:false) e tenta enviar. */
      const recordSession = (startedAt: number, durationSec: number) => {
        if (durationSec < 60) return;
        const { subject, userId, providerToken, settings } = get();
        const session: Session = {
          id: uid(),
          subject: subject || "Geral",
          started_at: new Date(startedAt).toISOString(),
          duration_sec: Math.round(durationSec),
          synced: false,
        };
        set((s) => ({ sessions: [...s.sessions, session] }));
        void get().flushPending();
        if (settings.autoSaveCalendar && providerToken && userId) {
          createStudyEvent(providerToken, session.subject, startedAt, session.duration_sec).catch(
            (e) => {
              if (e instanceof CalendarAuthError) {
                set({ providerToken: null });
                toast.warning("Sessão do Google expirou. Reconecte o calendário nas configurações.");
              } else toast.warning("Não foi possível salvar no Google Calendar agora.");
            }
          );
        }
      };

      return {
        tab: "timer",
        mode: "timer",
        phase: "focus",
        status: "idle",
        targetEnd: null,
        remainingMs: null,
        plannedMs: DEFAULT_SETTINGS.focusMin * 60_000,
        swStartedAt: null,
        swAccMs: 0,
        sessionStartedAt: null,
        cycles: 0,
        subject: "Geral",
        subjectManual: false,
        subjects: ["Geral", "HTML", "CSS", "JavaScript"],
        settings: DEFAULT_SETTINGS,
        sessions: [],
        notes: [],
        tasks: [],
        userId: null,
        userEmail: null,
        providerToken: null,
        calendarEvents: [],
        calendarEntries: [],
        calendarTags: [
          { id: "event", label: "Evento", color: "blue" },
          { id: "assignment", label: "Trabalho", color: "purple" },
          { id: "deadline", label: "Prazo", color: "red" },
        ],

        setTab: (tab) => set({ tab }),

        setMode: (mode) => {
          const s = get();
          if (s.mode === mode) return;
          if (s.status !== "idle") s.reset();
          set({ mode, phase: "focus", plannedMs: phaseMs(get().settings, "focus") });
        },

        setPhase: (phase) => {
          const s = get();
          if (s.status !== "idle") s.reset();
          set({ phase, plannedMs: phaseMs(get().settings, phase), remainingMs: null });
        },

        getRemaining: (now = Date.now()) => {
          const s = get();
          if (s.status === "running" && s.targetEnd) return Math.max(0, s.targetEnd - now);
          if (s.status === "paused" && s.remainingMs != null) return s.remainingMs;
          return phaseMs(s.settings, s.phase);
        },

        getElapsed: (now = Date.now()) => {
          const s = get();
          return s.swAccMs + (s.status === "running" && s.swStartedAt ? now - s.swStartedAt : 0);
        },

        start: () => {
          const s = get();
          if (s.status === "running") return;
          const now = Date.now();
          if (s.mode === "timer") {
            const rem = s.status === "paused" && s.remainingMs ? s.remainingMs : phaseMs(s.settings, s.phase);
            set({
              status: "running",
              targetEnd: now + rem,
              remainingMs: null,
              plannedMs: s.status === "paused" ? s.plannedMs : rem,
              sessionStartedAt: s.sessionStartedAt ?? now,
            });
          } else {
            set({ status: "running", swStartedAt: now, sessionStartedAt: s.sessionStartedAt ?? now });
          }
        },

        pause: () => {
          const s = get();
          if (s.status !== "running") return;
          const now = Date.now();
          if (s.mode === "timer") {
            set({ status: "paused", remainingMs: Math.max(0, (s.targetEnd ?? now) - now), targetEnd: null });
          } else {
            set({ status: "paused", swAccMs: s.getElapsed(now), swStartedAt: null });
          }
        },

        reset: () => {
          const s = get();
          const now = Date.now();
          // Progresso parcial de foco também conta (>= 1 min)
          if (s.sessionStartedAt && s.status !== "idle") {
            if (s.mode === "stopwatch") recordSession(s.sessionStartedAt, s.getElapsed(now) / 1000);
            else if (s.phase === "focus")
              recordSession(s.sessionStartedAt, (s.plannedMs - s.getRemaining(now)) / 1000);
          }
          set({
            status: "idle",
            targetEnd: null,
            remainingMs: null,
            swStartedAt: null,
            swAccMs: 0,
            sessionStartedAt: null,
            plannedMs: phaseMs(s.settings, s.phase),
          });
        },

        addMinute: () => {
          const s = get();
          if (s.mode !== "timer") return;
          if (s.status === "running" && s.targetEnd)
            set({ targetEnd: s.targetEnd + 60_000, plannedMs: s.plannedMs + 60_000 });
          else if (s.status === "paused" && s.remainingMs != null)
            set({ remainingMs: s.remainingMs + 60_000, plannedMs: s.plannedMs + 60_000 });
        },

        tick: () => {
          const s = get();
          if (s.mode !== "timer" || s.status !== "running" || !s.targetEnd) return;
          if (Date.now() < s.targetEnd) return;
          // Marca como idle ANTES dos efeitos para evitar disparo duplicado.
          const finishedFocus = s.phase === "focus";
          const started = s.sessionStartedAt ?? s.targetEnd - s.plannedMs;
          const planned = s.plannedMs;
          const cycles = finishedFocus ? s.cycles + 1 : s.cycles;
          const next: Phase = finishedFocus ? (cycles % 4 === 0 ? "long" : "short") : "focus";
          set({
            status: "idle",
            targetEnd: null,
            remainingMs: null,
            sessionStartedAt: null,
            cycles,
            phase: next,
            plannedMs: phaseMs(s.settings, next),
          });
          if (finishedFocus) recordSession(started, planned / 1000);
          
          const msg = finishedFocus ? "Foco concluído! Hora de uma pausa." : "Pausa terminou. Vamos focar?";
          
          if (s.settings.soundEnabled) playAlarm(s.settings.alarm, s.settings.volume);
          toast.success(msg);
          
          if (s.settings.notificationsEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("foco.", { body: msg });
          }
          
          if (typeof document !== "undefined") document.title = "foco.";
        },

        setSubject: (subject, manual = true) => set({ subject, subjectManual: manual }),
        addSubject: (name) => {
          const n = name.trim();
          if (!n) return;
          set((s) => ({
            subjects: s.subjects.includes(n) ? s.subjects : [...s.subjects, n],
            subject: n,
            subjectManual: true,
          }));
        },
        deleteSubject: (name) => {
          set((s) => {
            const newSubjects = s.subjects.filter((sub) => sub !== name);
            return {
              subjects: newSubjects,
              subject: s.subject === name ? "Geral" : s.subject,
            };
          });
        },

        updateSettings: (p) => {
          set((s) => {
            const settings = { ...s.settings, ...p };
            return {
              settings,
              plannedMs: s.status === "idle" ? phaseMs(settings, s.phase) : s.plannedMs,
            };
          });
        },

        addNote: (content, subject) => {
          if (!content.trim()) return;
          set((s) => ({
            notes: [
              { id: uid(), content: content.trim(), subject, created_at: new Date().toISOString(), synced: false },
              ...s.notes,
            ],
          }));
          void get().flushPending();
        },
        deleteNote: (id) => {
          set((s) => ({
            notes: s.notes.map((n) => (n.id === id ? { ...n, deleted_at: new Date().toISOString(), synced: false } : n)),
          }));
          void get().flushPending();
        },
        addTask: (title, subject) => {
          if (!title.trim()) return;
          set((s) => ({
            tasks: [
              { id: uid(), title: title.trim(), subject, done: false, created_at: new Date().toISOString(), synced: false },
              ...s.tasks,
            ],
          }));
          void get().flushPending();
        },
        toggleTask: (id) => {
          set((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done, synced: false } : t)),
          }));
          void get().flushPending();
        },
        deleteTask: (id) => {
          set((s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, deleted_at: new Date().toISOString(), synced: false } : t)),
          }));
          void get().flushPending();
        },
        addCalendarEntry: (title, type, date) => {
          if (!title.trim()) return;
          set((s) => ({
            calendarEntries: [
              ...s.calendarEntries,
              { id: uid(), title: title.trim(), type, date, synced: false },
            ],
          }));
          // void get().flushPending(); // Uncomment when table exists
        },
        deleteCalendarEntry: (id) => {
          set((s) => ({ calendarEntries: s.calendarEntries.filter((e) => e.id !== id) }));
        },
        addCalendarTag: (label, color) => {
          if (!label.trim()) return;
          set((s) => ({
            calendarTags: [
              ...s.calendarTags,
              { id: uid(), label: label.trim(), color },
            ],
          }));
        },

        setAuth: (userId, userEmail, token) =>
          set((s) => ({
            userId,
            userEmail,
            providerToken: userId ? (token ?? s.providerToken) : null,
            calendarEvents: userId ? s.calendarEvents : [],
          })),

        /**
         * Anti-bug #6: toda chamada ao Calendar é try/catch. Falhou? Toast discreto
         * e o timer continua em modo manual.
         */
        refreshCalendar: async () => {
          const { providerToken } = get();
          if (!providerToken) return;
          try {
            const events = await fetchTodayEvents(providerToken);
            set({ calendarEvents: events });
            const cur = currentEvent(events);
            if (cur && !get().subjectManual && get().status === "idle") {
              set((s) => ({
                subject: cur.summary,
                subjects: s.subjects.includes(cur.summary) ? s.subjects : [...s.subjects, cur.summary],
              }));
            }
          } catch (e) {
            if (e instanceof CalendarAuthError) {
              set({ providerToken: null, calendarEvents: [] });
              toast.warning("Acesso ao Google Calendar expirou. Reconecte nas configurações.", { id: "cal" });
            } else {
              toast.warning("Google Calendar indisponível. Usando modo manual.", { id: "cal" });
            }
          }
        },

        /**
         * Anti-bug #5: itens com synced:false ficam no localStorage (persist)
         * e são reenviados quando a conexão volta (evento 'online' no Providers).
         */
        flushPending: async () => {
          const { userId } = get();
          if (!supabase || !userId) return;
          if (typeof navigator !== "undefined" && !navigator.onLine) return;
          const s = get();
          try {
            const ps = s.sessions.filter((x) => !x.synced);
            if (ps.length) {
              const { error } = await supabase
                .from("study_sessions")
                .upsert(ps.map((r) => ({ ...omit(r, "synced"), user_id: userId })));
              if (error) throw error;
              const ids = new Set(ps.map((x) => x.id));
              set((st) => ({ sessions: st.sessions.map((x) => (ids.has(x.id) ? { ...x, synced: true } : x)) }));
            }
            const ns = s.notes.filter((x) => x.synced === false);
            if (ns.length) {
              const { error } = await supabase
                .from("notes")
                .upsert(ns.map((r) => ({ ...omit(r, "synced"), user_id: userId })));
              if (error) throw error;
              const ids = new Set(ns.map((x) => x.id));
              set((st) => ({ notes: st.notes.map((x) => (ids.has(x.id) ? { ...x, synced: true } : x)) }));
            }
            const ts = s.tasks.filter((x) => x.synced === false);
            if (ts.length) {
              const { error } = await supabase
                .from("tasks")
                .upsert(ts.map((r) => ({ ...omit(r, "synced"), user_id: userId })));
              if (error) throw error;
              const ids = new Set(ts.map((x) => x.id));
              set((st) => ({ tasks: st.tasks.map((x) => (ids.has(x.id) ? { ...x, synced: true } : x)) }));
            }
          } catch {
            // Falhou (offline/servidor): permanece pendente e tentamos de novo depois.
          }
        },

        loadRemote: async () => {
          const { userId } = get();
          if (!supabase || !userId) return;
          try {
            await get().flushPending();
            const [a, b, c] = await Promise.all([
              supabase.from("study_sessions").select("id,subject,started_at,duration_sec,deleted_at"),
              supabase.from("notes").select("id,subject,content,created_at,deleted_at"),
              supabase.from("tasks").select("id,title,subject,done,created_at,deleted_at"),
            ]);
            set((s) => {
              const merge = <T extends { id: string; synced?: boolean }>(local: T[], remote: T[] | null) => {
                const pending = local.filter((x) => x.synced === false);
                const pIds = new Set(pending.map((x) => x.id));
                return [...(remote ?? []).filter((x) => !pIds.has(x.id)).map((x) => ({ ...x, synced: true })), ...pending];
              };
              return {
                sessions: merge(s.sessions as (Session & { synced?: boolean })[], a.data as Session[] | null) as Session[],
                notes: merge(s.notes, b.data as Note[] | null).sort((x, y) => y.created_at.localeCompare(x.created_at)),
                tasks: merge(s.tasks, c.data as Task[] | null).sort((x, y) => y.created_at.localeCompare(x.created_at)),
              };
            });
          } catch {
            toast.warning("Sem conexão com o servidor. Mostrando dados locais.", { id: "remote" });
          }
        },
      };
    },
    {
      name: "foco-store",
      storage: createJSONStorage(() => localStorage),
      // Evita Hydration Mismatch: reidratamos manualmente no cliente (Providers).
      skipHydration: true,
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(([k, v]) => k !== "calendarEvents" && typeof v !== "function")
        ) as Partial<State>,
    }
  )
);
