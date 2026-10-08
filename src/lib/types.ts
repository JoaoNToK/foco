export type Phase = "focus" | "short" | "long";
export type TimerMode = "timer" | "stopwatch";
export type Status = "idle" | "running" | "paused";
export type TabId = "timer" | "notes" | "reminders" | "progress" | "calendar";
export type AlarmSound = "bell" | "digital" | "beep";

export interface Session {
  id: string;
  subject: string;
  /** ISO em UTC */
  started_at: string;
  duration_sec: number;
  synced: boolean;
}

export interface Note {
  id: string;
  subject: string | null;
  content: string;
  created_at: string;
  synced?: boolean;
}

export interface Task {
  id: string;
  title: string;
  subject: string | null;
  done: boolean;
  created_at: string;
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
  synced?: boolean;
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
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: number; // ms
  end: number; // ms
}
