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
  KanbanTaskExtras,
} from "@/lib/types";
import { playAlarm } from "@/lib/audio";
import { supabase } from "@/lib/supabase";
import { DEFAULT_EXTRAS, EMPTY_KANBAN, nextOrder, placeInColumn, sortByOrder, toFull, getNextRecurrenceDate } from "@/lib/kanban";

const EXTRA_KEYS = [
  "status", "listId", "subtasks", "tags", "dueDate", "order", "priority",
  "description", "recurrence", "archived", "focusSec", "props",
] as const satisfies readonly (keyof KanbanTaskExtras)[];
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
  kanban: {
    lists: [{ id: "default", name: "Geral" }],
    taskExtras: {},
  },
};

interface State {
  tab: TabId;
  mode: TimerMode;
  phase: Phase;
  status: Status;
  /**
   * Anti-bug #1 (throttling): o tempo NUNCA Ã© decrementado por tick.
   * Guardamos o instante-alvo (timestamp) e derivamos o restante com Date.now().
   */
  targetEnd: number | null; // timer rodando
  remainingMs: number | null; // timer pausado
  plannedMs: number; // total planejado da rodada atual (inclui +1:00)
  swStartedAt: number | null; // cronÃ´metro rodando
  swAccMs: number; // cronÃ´metro acumulado
  sessionStartedAt: number | null;
  cycles: number;
  subject: string;
  subjectManual: boolean;
  activeTaskId: string | null;
  currentCalendarEventId: string | null;
  subjects: string[];
  settings: Settings;
  sessions: Session[];
  notes: Note[];
  tasks: Task[];
  userId: string | null;
  userEmail: string | null;
  googleConnected: boolean;
  calendarEvents: CalendarEvent[];
  calendarEntries: CalendarEntry[];
  calendarTags: CalendarTag[];
  settingsSynced: boolean;

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
  focusOnTask: (taskId: string) => void;
  addSubject: (s: string) => void;
  deleteSubject: (s: string) => void;
  updateSettings: (p: Partial<Settings>) => void;

  addNote: (content: string, subject: string | null) => void;
  deleteNote: (id: string) => void;
  addTask: (title: string, subject: string | null) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addKanbanTask: (title: string, listId: string, status?: KanbanTaskExtras["status"]) => void;
  updateKanbanTask: (id: string, payload: Partial<Task & KanbanTaskExtras>) => void;
  moveKanbanTask: (id: string, status: KanbanTaskExtras["status"], overId?: string | null) => void;
  archiveKanbanTasks: (listId: string) => void;
  setTagColor: (tag: string, colorIndex: number) => void;
  addTaskList: (name: string) => void;
  deleteTaskList: (id: string) => void;
  addKanbanPropDef: (listId: string, def: import("@/lib/types").PropDef) => void;
  deleteKanbanPropDef: (listId: string, propId: string) => void;
  addCalendarEntry: (title: string, type: string, date: string) => void;
  deleteCalendarEntry: (id: string) => void;
  addCalendarTag: (label: string, color: string) => void;

  setAuth: (userId: string | null, email: string | null) => void;
  refreshCalendar: () => Promise<void>;
  flushPending: () => Promise<void>;
  loadRemote: () => Promise<void>;
}

const phaseMs = (s: Settings, p: Phase) =>
  (p === "focus" ? s.focusMin : p === "short" ? s.shortMin : s.longMin) * 60_000;

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Registra sessÃ£o: salva local (synced:false) e tenta enviar. */
      const recordSession = (startedAt: number, durationSec: number) => {
        if (durationSec < 60) return;
        const { subject, userId, activeTaskId } = get();
        const session: Session = {
          id: uid(),
          subject: subject || "Geral",
          started_at: new Date(startedAt).toISOString(),
          duration_sec: Math.round(durationSec),
          synced: false,
          user_id: userId ?? undefined,
        };
        set((s) => ({ sessions: [...s.sessions, session] }));

        if (activeTaskId) {
          const currentExtras = get().settings.kanban?.taskExtras[activeTaskId];
          if (currentExtras) {
            get().updateKanbanTask(activeTaskId, {
              focusSec: (currentExtras.focusSec ?? 0) + Math.round(durationSec)
            });
          }
        }
        void get().flushPending();
        if (settings.autoSaveCalendar && get().googleConnected && userId) {
          createStudyEvent(session.subject, startedAt, session.duration_sec).catch(
            (e) => {
              if (e instanceof CalendarAuthError) {
                set({ googleConnected: false });
                toast.warning("SessÃ£o do Google expirou. Reconecte o calendÃ¡rio nas configuraÃ§Ãµes.");
              } else {
                toast.warning("NÃ£o foi possÃ­vel salvar no Google Calendar agora.");
              }
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
        activeTaskId: null,
        currentCalendarEventId: null,
        subjects: ["Geral", "HTML", "CSS", "JavaScript"],
        settings: DEFAULT_SETTINGS,
        sessions: [],
        notes: [],
        tasks: [],
        userId: null,
        userEmail: null,
        googleConnected: false,
        calendarEvents: [],
        calendarEntries: [],
        calendarTags: [
          { id: "event", label: "Evento", color: "blue" },
          { id: "assignment", label: "Trabalho", color: "purple" },
          { id: "deadline", label: "Prazo", color: "red" },
        ],
        settingsSynced: true,

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
          // Progresso parcial de foco tambÃ©m conta (>= 1 min)
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
          
          const msg = finishedFocus ? "Foco concluÃ­do! Hora de uma pausa." : "Pausa terminou. Vamos focar?";
          
          if (s.settings.soundEnabled) playAlarm(s.settings.alarm, s.settings.volume);
          toast.success(msg);
          
          if (s.settings.notificationsEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("foco.", { body: msg });
          }
          
          if (typeof document !== "undefined") document.title = "foco.";
        },

        setSubject: (subject, manual = true) => set({ subject, subjectManual: manual, activeTaskId: null }),
        focusOnTask: (taskId) => {
          const s = get();
          const task = s.tasks.find((t) => t.id === taskId);
          if (!task) return;
          set({
            tab: "timer",
            activeTaskId: taskId,
            subject: task.title,
            subjectManual: true,
          });
        },
        addSubject: (name) => {
          const n = name.trim();
          if (!n) return;
          set((s) => ({
            subjects: s.subjects.includes(n) ? s.subjects : [...s.subjects, n],
            subject: n,
            subjectManual: true,
            settingsSynced: false,
          }));
          void get().flushPending();
        },
        deleteSubject: (name) => {
          set((s) => {
            const newSubjects = s.subjects.filter((sub) => sub !== name);
            return {
              subjects: newSubjects,
              subject: s.subject === name ? "Geral" : s.subject,
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },

        updateSettings: (p) => {
          set((s) => {
            const settings = { ...s.settings, ...p };
            return {
              settings,
              plannedMs: s.status === "idle" ? phaseMs(settings, s.phase) : s.plannedMs,
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },

        addNote: (content, subject) => {
          if (!content.trim()) return;
          set((s) => ({
            notes: [
              { id: uid(), content: content.trim(), subject, created_at: new Date().toISOString(), synced: false, user_id: s.userId ?? undefined },
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
              { id: uid(), title: title.trim(), subject, done: false, created_at: new Date().toISOString(), synced: false, user_id: s.userId ?? undefined },
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
        addKanbanTask: (title, listId, status = "todo") => {
          if (!title.trim()) return;
          const id = uid();
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            return {
              tasks: [
                { id, title: title.trim(), subject: null, done: status === "done", created_at: new Date().toISOString(), synced: false, user_id: s.userId ?? undefined },
                ...s.tasks,
              ],
              settings: {
                ...s.settings,
                kanban: {
                  ...kb,
                  taskExtras: {
                    ...kb.taskExtras,
                    [id]: { ...DEFAULT_EXTRAS, status, listId, order: nextOrder(kb) },
                  },
                },
              },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        updateKanbanTask: (id, payload) => {
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            const cur = { ...DEFAULT_EXTRAS, ...(kb.taskExtras[id] ?? {}) };
            const extras: KanbanTaskExtras = { ...cur };
            for (const k of EXTRA_KEYS) {
              if (payload[k] !== undefined) (extras as unknown as Record<string, unknown>)[k] = payload[k];
            }
            const oldDone = cur.status === "done";
            const newDone = extras.status === "done";

            const newTasks = s.tasks.map((t) =>
              t.id === id
                ? {
                    ...t,
                    title: payload.title !== undefined ? payload.title : t.title,
                    done: newDone,
                    synced: false,
                  }
                : t
            );

            const newExtras = { ...kb.taskExtras, [id]: extras };

            if (!oldDone && newDone && cur.recurrence && cur.recurrence !== "none") {
              const baseT = newTasks.find(t => t.id === id);
              if (baseT) {
                const newId = uid();
                newTasks.unshift({
                  id: newId, title: baseT.title, subject: null, done: false, created_at: new Date().toISOString(), synced: false, user_id: s.userId ?? undefined
                });
                newExtras[newId] = {
                  ...cur,
                  status: "todo",
                  subtasks: cur.subtasks.map(st => ({ ...st, done: false })),
                  dueDate: getNextRecurrenceDate(cur.dueDate, cur.recurrence) ?? cur.dueDate,
                  order: nextOrder({ lists: kb.lists, taskExtras: newExtras })
                };
              }
            }

            return {
              tasks: newTasks,
              settings: { ...s.settings, kanban: { ...kb, taskExtras: newExtras } },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        moveKanbanTask: (id, status, overId) => {
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            const moving = kb.taskExtras[id];
            if (!moving) return {};
            const colIds = sortByOrder(
              s.tasks
                .filter((t) => !t.deleted_at)
                .map((t) => ({ ...toFull(t, kb) }))
                .filter((t) => t.listId === moving.listId && t.status === status && !t.archived)
            ).map((t) => t.id);
            const newIds = placeInColumn(colIds, id, overId ?? null);
            const extras = { ...kb.taskExtras };
            newIds.forEach((tid, i) => {
              extras[tid] = { ...DEFAULT_EXTRAS, ...extras[tid], order: i };
            });
            extras[id] = { ...extras[id], status };

            const newTasks = s.tasks.map((t) => (t.id === id ? { ...t, done: status === "done", synced: false } : t));

            if (moving.status !== "done" && status === "done" && moving.recurrence && moving.recurrence !== "none") {
              const baseT = newTasks.find(t => t.id === id);
              if (baseT) {
                const newId = uid();
                newTasks.unshift({
                  id: newId, title: baseT.title, subject: null, done: false, created_at: new Date().toISOString(), synced: false, user_id: s.userId ?? undefined
                });
                extras[newId] = {
                  ...moving,
                  status: "todo",
                  subtasks: moving.subtasks.map(st => ({ ...st, done: false })),
                  dueDate: getNextRecurrenceDate(moving.dueDate, moving.recurrence) ?? moving.dueDate,
                  order: nextOrder({ lists: kb.lists, taskExtras: extras })
                };
              }
            }

            return {
              tasks: newTasks,
              settings: { ...s.settings, kanban: { ...kb, taskExtras: extras } },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        archiveKanbanTasks: (listId) => {
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            const extras = { ...kb.taskExtras };
            let changed = false;
            for (const [id, ex] of Object.entries(extras)) {
              if (ex.listId === listId && ex.status === "done" && !ex.archived) {
                extras[id] = { ...ex, archived: true };
                changed = true;
              }
            }
            if (!changed) return {};
            return {
              settings: { ...s.settings, kanban: { ...kb, taskExtras: extras } },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        setTagColor: (tag, colorIndex) => {
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            return {
              settings: { ...s.settings, kanban: { ...kb, tagColors: { ...(kb.tagColors ?? {}), [tag]: colorIndex } } },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        addTaskList: (name) => {
          if (!name.trim()) return;
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            return {
              settings: { ...s.settings, kanban: { ...kb, lists: [...kb.lists, { id: uid(), name: name.trim() }] } },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        deleteTaskList: (id) => {
          if (id === "default") return;
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            const doomed = new Set(Object.entries(kb.taskExtras).filter(([, e]) => e.listId === id).map(([k]) => k));
            const now = new Date().toISOString();
            return {
              tasks: s.tasks.map((t) => (doomed.has(t.id) ? { ...t, deleted_at: now, synced: false } : t)),
              settings: { ...s.settings, kanban: { ...kb, lists: kb.lists.filter((l) => l.id !== id) } },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        addKanbanPropDef: (listId, def) => {
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            const defs = kb.propDefs ?? {};
            const listDefs = defs[listId] ?? [];
            return {
              settings: {
                ...s.settings,
                kanban: { ...kb, propDefs: { ...defs, [listId]: [...listDefs, def] } },
              },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        deleteKanbanPropDef: (listId, propId) => {
          set((s) => {
            const kb = s.settings.kanban ?? EMPTY_KANBAN;
            const defs = kb.propDefs ?? {};
            const listDefs = defs[listId] ?? [];
            return {
              settings: {
                ...s.settings,
                kanban: { ...kb, propDefs: { ...defs, [listId]: listDefs.filter((d) => d.id !== propId) } },
              },
              settingsSynced: false,
            };
          });
          void get().flushPending();
        },
        addCalendarEntry: (title, type, date) => {
          if (!title.trim()) return;
          set((s) => ({
            calendarEntries: [
              ...s.calendarEntries,
              { id: uid(), title: title.trim(), type, date, synced: false, user_id: s.userId ?? undefined },
            ],
          }));
          void get().flushPending();
        },
        deleteCalendarEntry: (id) => {
          set((s) => ({
            calendarEntries: s.calendarEntries.map((e) => (e.id === id ? { ...e, deleted_at: new Date().toISOString(), synced: false } : e)),
          }));
          void get().flushPending();
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

        setAuth: (userId, userEmail) =>
          set((s) => ({
            userId,
            userEmail,
            googleConnected: userId ? true : false, // Assumimos true otimisticamente se o usuÃ¡rio estiver logado
            calendarEvents: userId ? s.calendarEvents : [],
          })),

        /**
         * Anti-bug #6: toda chamada ao Calendar Ã© try/catch. Falhou? Toast discreto
         * e o timer continua em modo manual.
         */
        refreshCalendar: async () => {
          if (!get().googleConnected) return;
          try {
            const events = await fetchTodayEvents();
            set({ calendarEvents: events });
            const cur = currentEvent(events);
            const { currentCalendarEventId, subjectManual, status } = get();

            if (cur) {
              // Se comeÃ§ou um evento NOVO na agenda, cancelamos a escolha manual e assumimos ele
              if (cur.id !== currentCalendarEventId) {
                set((s) => ({
                  subject: cur.summary,
                  subjects: s.subjects.includes(cur.summary) ? s.subjects : [...s.subjects, cur.summary],
                  settingsSynced: s.subjects.includes(cur.summary) ? s.settingsSynced : false,
                  subjectManual: false,
                  currentCalendarEventId: cur.id,
                }));
                void get().flushPending();
              } else if (!subjectManual && status === "idle") {
                // SincronizaÃ§Ã£o normal caso nÃ£o tenha override manual
                set((s) => ({
                  subject: cur.summary,
                  subjects: s.subjects.includes(cur.summary) ? s.subjects : [...s.subjects, cur.summary],
                  settingsSynced: s.subjects.includes(cur.summary) ? s.settingsSynced : false,
                }));
                void get().flushPending();
              }
            } else if (currentCalendarEventId) {
              // O evento que estava rolando acabou
              set({ currentCalendarEventId: null });
            }
          } catch (e) {
            if (e instanceof CalendarAuthError) {
              set({ googleConnected: false, calendarEvents: [] });
              toast.warning("SessÃ£o do Google expirou. Reconecte nas configuraÃ§Ãµes.", { id: "cal" });
            } else {
              toast.warning("Google Calendar indisponÃ­vel. Usando modo manual.", { id: "cal" });
            }
          }
        },

        flushPending: async () => {
          const { userId } = get();
          if (!supabase || !userId) return;
          if (typeof navigator !== "undefined" && !navigator.onLine) return;
          const s = get();

          const processQueue = async <T extends { id: string; synced?: boolean; deleted_at?: string | null; user_id?: string }>(
            table: string,
            items: T[],
            stateKey: "sessions" | "notes" | "tasks" | "calendarEntries"
          ) => {
            // Apenas processa os itens que nÃ£o tÃªm dono (retrocompatibilidade) ou que sÃ£o do usuÃ¡rio atual
            const pending = items.filter(
              (x) => x.synced === false && (!x.user_id || x.user_id === userId)
            );
            if (!pending.length) return;

            const toDelete = pending.filter((x) => x.deleted_at);
            const toUpsert = pending.filter((x) => !x.deleted_at);

            if (toUpsert.length) {
              const { error } = await supabase!
                .from(table)
                .upsert(toUpsert.map((r) => ({ ...omit(r, "synced"), user_id: userId })));
              if (error) throw error;
            }

            if (toDelete.length) {
              const { error } = await supabase!
                .from(table)
                .delete()
                .in("id", toDelete.map((x) => x.id));
              if (error) throw error;
            }

            const upsertedIds = new Set(toUpsert.map((x) => x.id));
            const deletedIds = new Set(toDelete.map((x) => x.id));

            set((st) => ({
              [stateKey]: (st[stateKey] as unknown as T[])
                .filter((x) => !deletedIds.has(x.id))
                .map((x) => (upsertedIds.has(x.id) ? { ...x, synced: true } : x)),
            }));
          };

          try {
            await processQueue("study_sessions", s.sessions, "sessions");
            await processQueue("notes", s.notes, "notes");
            await processQueue("tasks", s.tasks, "tasks");
            await processQueue("calendar_entries", s.calendarEntries, "calendarEntries");

            if (s.settingsSynced === false) {
              const { error } = await supabase
                .from("user_settings")
                .upsert({ user_id: userId, settings: s.settings, subjects: s.subjects });
              if (!error) set({ settingsSynced: true });
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
            const [a, b, c, d, e] = await Promise.all([
              supabase.from("study_sessions").select("id,subject,started_at,duration_sec,deleted_at"),
              supabase.from("notes").select("id,subject,content,created_at,deleted_at"),
              supabase.from("tasks").select("id,title,subject,done,created_at,deleted_at"),
              supabase.from("user_settings").select("settings,subjects").eq("user_id", userId).single(),
              supabase.from("calendar_entries").select("id,title,type,date,deleted_at"),
            ]);
            set((s) => {
              const merge = <T extends { id: string; synced?: boolean }>(local: T[], remote: T[] | null) => {
                const pending = local.filter((x) => x.synced === false);
                const pIds = new Set(pending.map((x) => x.id));
                return [...(remote ?? []).filter((x) => !pIds.has(x.id)).map((x) => ({ ...x, synced: true })), ...pending];
              };
              
              const remoteSettings = d.data && s.settingsSynced ? (d.data.settings as Settings) : null;
              const newSettings = remoteSettings
                ? { ...remoteSettings, kanban: remoteSettings.kanban ?? s.settings.kanban }
                : s.settings;
              const newSubjects = d.data && s.settingsSynced ? (d.data.subjects as string[]) : s.subjects;
              
              return {
                sessions: merge(s.sessions as (Session & { synced?: boolean })[], a.data as Session[] | null) as Session[],
                notes: merge(s.notes, b.data as Note[] | null).sort((x, y) => y.created_at.localeCompare(x.created_at)),
                tasks: merge(s.tasks, c.data as Task[] | null).sort((x, y) => y.created_at.localeCompare(x.created_at)),
                settings: newSettings,
                subjects: newSubjects,
                calendarEntries: merge(s.calendarEntries, e.data as CalendarEntry[] | null),
                plannedMs: s.status === "idle" ? phaseMs(newSettings, s.phase) : s.plannedMs,
              };
            });
          } catch {
            toast.warning("Sem conexÃ£o com o servidor. Mostrando dados locais.", { id: "remote" });
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
          Object.entries(s).filter(
            ([k, v]) =>
              k !== "calendarEvents" &&
              k !== "subjectManual" &&
              k !== "currentCalendarEventId" &&
              typeof v !== "function"
          )
        ) as Partial<State>,
    }
  )
);
