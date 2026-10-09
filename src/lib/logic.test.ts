import { describe, expect, it, vi } from "vitest";
import { aggregate } from "@/components/ProgressChart";
import { CalendarAuthError, createStudyEvent, currentEvent, fetchTodayEvents } from "@/lib/calendar";
import type { Session } from "@/lib/types";

const s = (id: string, started_at: string, duration_sec: number, subject = "HTML"): Session => ({
  id,
  subject,
  started_at,
  duration_sec,
  synced: true,
});

describe("Conversão de fuso horário (UTC → local, UTC-3)", () => {
  // Quinta 08/10/2026 → semana de Dom 04/10 a Sáb 10/10
  const today = new Date("2026-10-08T15:00:00-03:00");

  it("sessão às 22:30 locais de terça (01:30 UTC de quarta) cai na TERÇA", () => {
    const r = aggregate([s("1", "2026-10-07T01:30:00Z", 3600)], 0, today);
    expect(r.chart[2]).toEqual({ day: "Ter", min: 60 });
    expect(r.chart[3].min).toBe(0); // quarta (dia UTC) não recebe
  });

  it("'Hoje' usa o dia local e destaca o índice de quinta (4)", () => {
    const r = aggregate(
      [s("1", "2026-10-08T12:00:00-03:00", 1800), s("2", "2026-10-08T01:00:00Z", 600)], // 2ª = 22h de quarta local (07/10)
      0,
      today
    );
    expect(r.todayIdx).toBe(4);
    expect(r.todayMin).toBe(30);
    expect(r.chart[3].min).toBe(10);
  });

  it("ignora sessões fora da semana atual", () => {
    const r = aggregate([s("1", "2026-10-03T15:00:00Z", 3600), s("2", "2026-10-11T15:00:00Z", 3600)], 0, today);
    expect(r.chart.every((d) => d.min === 0)).toBe(true);
    expect(r.subjects).toEqual([]);
  });

  it("soma por matéria e ordena do maior para o menor", () => {
    const r = aggregate(
      [
        s("1", "2026-10-05T15:00:00Z", 3600, "HTML"),
        s("2", "2026-10-06T15:00:00Z", 1800, "HTML"),
        s("3", "2026-10-06T16:00:00Z", 7200, "CSS"),
      ],
      0,
      today
    );
    expect(r.subjects).toEqual([
      { name: "CSS", min: 120 },
      { name: "HTML", min: 90 },
    ]);
  });

  it("domingo local é o início da semana (índice 0)", () => {
    const r = aggregate([s("1", "2026-10-04T12:00:00-03:00", 600)], 0, today);
    expect(r.chart[0]).toEqual({ day: "Dom", min: 10 });
  });
});

describe("lib/calendar", () => {
  it("currentEvent encontra o evento em andamento (fim exclusivo)", () => {
    const ev = [
      { id: "1", summary: "A", start: 100, end: 200 },
      { id: "2", summary: "B", start: 200, end: 300 },
    ];
    expect(currentEvent(ev, 150)?.summary).toBe("A");
    expect(currentEvent(ev, 200)?.summary).toBe("B");
    expect(currentEvent(ev, 300)).toBeNull();
  });

  it("401/403 → CalendarAuthError; outros erros → Error genérico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    await expect(fetchTodayEvents("t")).rejects.toBeInstanceOf(CalendarAuthError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchTodayEvents("t")).rejects.not.toBeInstanceOf(CalendarAuthError);
    vi.unstubAllGlobals();
  });

  it("envia Bearer token e intervalo de hoje (00:00–24:00 local)", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", f);
    await fetchTodayEvents("abc");
    const [url, init] = f.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer abc");
    const q = new URL(url).searchParams;
    const a = new Date(q.get("timeMin")!);
    const b = new Date(q.get("timeMax")!);
    expect(a.getHours()).toBe(0);
    expect(b.getTime() - a.getTime()).toBe(86_400_000);
    vi.unstubAllGlobals();
  });

  it("createStudyEvent monta início/fim corretamente", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", f);
    await createStudyEvent("t", "CSS", Date.UTC(2026, 9, 8, 15), 1500);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.summary).toBe("Estudo: CSS");
    expect(new Date(body.end.dateTime).getTime() - new Date(body.start.dateTime).getTime()).toBe(1_500_000);
    vi.unstubAllGlobals();
  });
});
