import type { CalendarEvent } from "./types";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class CalendarAuthError extends Error {}

async function call(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) throw new CalendarAuthError("token expirado");
  if (!res.ok) throw new Error(`Calendar API ${res.status}`);
  return res.json();
}

/** Eventos de hoje (fuso local). Lança erro: quem chama trata com try/catch. */
export async function fetchTodayEvents(token: string): Promise<CalendarEvent[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const qs = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const data = await call(token, `${BASE}?${qs}`);
  return (data.items ?? [])
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
  token: string,
  subject: string,
  startMs: number,
  durationSec: number
) {
  return call(token, BASE, {
    method: "POST",
    body: JSON.stringify({
      summary: `Estudo: ${subject}`,
      description: "Sessão registrada pelo foco.",
      start: { dateTime: new Date(startMs).toISOString() },
      end: { dateTime: new Date(startMs + durationSec * 1000).toISOString() },
    }),
  });
}
