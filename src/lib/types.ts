export type Phase = "focus" | "short" | "long";
export type TimerMode = "timer" | "stopwatch";
export type Status = "idle" | "running" | "paused";
export type TabId = "timer" | "notes" | "tasks" | "progress" | "calendar";
export type AlarmSound = "bell" | "digital" | "beep";

export interface Session {
  id: string;
  subject: string;
  /** ISO em UTC */
  started_at: string;
  duration_sec: number;
  synced: boolean;
  deleted_at?: string | null;
  user_id?: string;
}

export interface Note {
  id: string;
  subject: string | null;
  content: string;
  created_at: string;
  deleted_at?: string | null;
  synced?: boolean;
  user_id?: string;
}

export interface Task {
  id: string;
  title: string;
  subject: string | null;
  done: boolean;
  created_at: string;
  deleted_at?: string | null;
  synced?: boolean;
  user_id?: string;
}

export interface CalendarTag {
  id: string;
  label: string;
  color: string;
}

export interface CalendarEntry {
  id: string;
  title: string;
  type: string; // matches CalendarTag.id
  date: string; // ISO format or YYYY-MM-DD
  deleted_at?: string | null;
  synced?: boolean;
  user_id?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface KanbanTaskExtras {
  status: "todo" | "in_progress" | "done";
  listId: string; // The list it belongs to
  subtasks: Subtask[];
  tags: string[];
  dueDate: string | null;
}

export interface TaskList {
  id: string;
  name: string;
}

export interface KanbanData {
  lists: TaskList[];
  taskExtras: Record<string, KanbanTaskExtras>;
}

export interface Settings {
  soundEnabled: boolean;
  volume: number; // 0..1
  alarm: AlarmSound;
  focusMin: number;
  shortMin: number;
  longMin: number;
  autoSaveCalendar: boolean;
  notificationsEnabled: boolean;
  dailyGoalMin: number;
  kanban?: KanbanData; // Optional para retrocompatibilidade
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: number; // ms
  end: number; // ms
}
