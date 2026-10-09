import type { CalendarEvent } from "./types";

export class CalendarAuthError extends Error {}

/** Eventos de hoje (fuso local). O backend lê o token HttpOnly automaticamente. */
export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const res = await fetch("/api/calendar/events");
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError("token expirado ou ausente");
  }
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  const data = await res.json();
  return (data ?? [])
    .filter((e: { start?: { dateTime?: string } }) => e.start?.dateTime)
    .map((e: { id: string; summary?: string; start: { dateTime: string }; end: { dateTime: string } }) => ({
      id: e.id,
      summary: e.summary ?? "Sem título",
      start: new Date(e.start.dateTime).getTime(),
      end: new Date(e.end.dateTime).getTime(),
    }));
}

export function currentEvent(events: CalendarEvent[], now = Date.now()) {
  return events.find((e) => e.start <= now && now < e.end) ?? null;
}

export async function createStudyEvent(
  subject: string,
  startedAt: number,
  durationSec: number
) {
  const res = await fetch("/api/calendar/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, startedAt, durationSec }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError("token expirado ou ausente");
  }
  if (!res.ok) throw new Error("Falha ao criar evento");
  return res.json();
}
