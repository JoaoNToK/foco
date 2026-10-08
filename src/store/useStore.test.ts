import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Supabase falso e controlável (para testar a fila offline).
const upsert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      upsert,
      delete: () => ({ eq: () => Promise.resolve({}) }),
      select: () => Promise.resolve({ data: [] }),
    }),
  },
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { DEFAULT_SETTINGS, useStore } from "./useStore";
import { toast } from "sonner";

const initial = useStore.getState();
const T0 = new Date("2026-10-08T12:00:00-03:00").getTime();
const sec = (n: number) => n * 1000;
const min = (n: number) => n * 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  useStore.setState({ ...initial, settings: { ...DEFAULT_SETTINGS }, sessions: [], notes: [], tasks: [] }, true);
  upsert.mockReset();
  upsert.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Timer baseado em timestamps (anti-throttling)", () => {
  it("começa em 25:00 e respeita as fases", () => {
    expect(useStore.getState().getRemaining()).toBe(min(25));
    useStore.getState().setPhase("short");
    expect(useStore.getState().getRemaining()).toBe(min(5));
    useStore.getState().setPhase("long");
    expect(useStore.getState().getRemaining()).toBe(min(15));
  });

  it("calcula o restante pelo relógio mesmo SEM nenhum tick (aba em segundo plano)", () => {
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(90)); // nenhum setInterval rodou
    expect(useStore.getState().getRemaining()).toBe(min(25) - sec(90));
  });

  it("pausa congela e continuar retoma de onde parou", () => {
    const s = useStore.getState();
    s.start();
    vi.setSystemTime(T0 + sec(30));
    useStore.getState().pause();
    expect(useStore.getState().status).toBe("paused");
    vi.setSystemTime(T0 + sec(300)); // tempo passa pausado
    expect(useStore.getState().getRemaining()).toBe(min(25) - sec(30));
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(310));
    expect(useStore.getState().getRemaining()).toBe(min(25) - sec(40));
  });

  it("+1:00 soma um minuto rodando e pausado; ignora quando parado", () => {
    useStore.getState().addMinute();
    expect(useStore.getState().getRemaining()).toBe(min(25));
    useStore.getState().start();
    useStore.getState().addMinute();
    expect(useStore.getState().getRemaining()).toBe(min(26));
    useStore.getState().pause();
    useStore.getState().addMinute();
    expect(useStore.getState().getRemaining()).toBe(min(27));
  });

  it("tick antes do fim não conclui; após o fim conclui uma única vez", () => {
    useStore.getState().updateSettings({ focusMin: 1 });
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(59));
    useStore.getState().tick();
    expect(useStore.getState().status).toBe("running");
    vi.setSystemTime(T0 + sec(61));
    useStore.getState().tick();
    useStore.getState().tick(); // duplicado
    const s = useStore.getState();
    expect(s.status).toBe("idle");
    expect(s.cycles).toBe(1);
    expect(s.phase).toBe("short");
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].duration_sec).toBe(60);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("pausa longa a cada 4 ciclos e volta para foco depois da pausa", () => {
    useStore.getState().updateSettings({ focusMin: 1, shortMin: 1, longMin: 1 });
    const seq: string[] = [];
    let t = T0;
    for (let i = 0; i < 4; i++) {
      useStore.getState().setPhase("focus");
      useStore.getState().start();
      t += sec(61);
      vi.setSystemTime(t);
      useStore.getState().tick();
      seq.push(useStore.getState().phase);
    }
    expect(seq).toEqual(["short", "short", "short", "long"]);
    useStore.getState().start();
    t += sec(61);
    vi.setSystemTime(t);
    useStore.getState().tick();
    expect(useStore.getState().phase).toBe("focus");
    expect(useStore.getState().cycles).toBe(4);
  });

  it("reiniciar: <1 min não grava; >=1 min grava o tempo decorrido", () => {
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(30));
    useStore.getState().reset();
    expect(useStore.getState().sessions).toHaveLength(0);

    vi.setSystemTime(T0 + sec(100));
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(100) + sec(150));
    useStore.getState().reset();
    const s = useStore.getState();
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].duration_sec).toBe(150);
    expect(s.status).toBe("idle");
    expect(s.getRemaining()).toBe(min(25));
  });

  it("pausas não geram sessão de estudo", () => {
    useStore.getState().updateSettings({ shortMin: 1 });
    useStore.getState().setPhase("short");
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(61));
    useStore.getState().tick();
    expect(useStore.getState().sessions).toHaveLength(0);
    expect(useStore.getState().cycles).toBe(0);
  });

  it("mudar os tempos padrão atualiza o relógio parado", () => {
    useStore.getState().updateSettings({ focusMin: 90 });
    expect(useStore.getState().getRemaining()).toBe(min(90));
  });
});

describe("Cronômetro", () => {
  it("acumula, pausa e reinicia gravando a sessão", () => {
    useStore.getState().setMode("stopwatch");
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(5));
    expect(useStore.getState().getElapsed()).toBe(sec(5));
    useStore.getState().pause();
    vi.setSystemTime(T0 + sec(50));
    expect(useStore.getState().getElapsed()).toBe(sec(5));
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(50) + sec(70));
    expect(useStore.getState().getElapsed()).toBe(sec(75));
    useStore.getState().reset();
    expect(useStore.getState().sessions[0].duration_sec).toBe(75);
    expect(useStore.getState().getElapsed()).toBe(0);
  });

  it("tick nunca conclui o cronômetro", () => {
    useStore.getState().setMode("stopwatch");
    useStore.getState().start();
    vi.setSystemTime(T0 + min(120));
    useStore.getState().tick();
    expect(useStore.getState().status).toBe("running");
  });
});

describe("Matérias, notas e lembretes", () => {
  it("adiciona matéria sem duplicar e a seleciona", () => {
    useStore.getState().addSubject("  Matemática ");
    useStore.getState().addSubject("Matemática");
    const s = useStore.getState();
    expect(s.subjects.filter((x) => x === "Matemática")).toHaveLength(1);
    expect(s.subject).toBe("Matemática");
    expect(s.subjectManual).toBe(true);
    useStore.getState().addSubject("   ");
    expect(useStore.getState().subjects).not.toContain("");
  });

  it("notas: ignora vazias, cria, vincula matéria e exclui", () => {
    useStore.getState().addNote("   ", null);
    expect(useStore.getState().notes).toHaveLength(0);
    useStore.getState().addNote("revisar", "HTML");
    const n = useStore.getState().notes[0];
    expect(n).toMatchObject({ content: "revisar", subject: "HTML" });
    useStore.getState().deleteNote(n.id);
    expect(useStore.getState().notes).toHaveLength(0);
  });

  it("lembretes: cria, alterna e exclui", () => {
    useStore.getState().addTask("estudar CSS", "CSS");
    const t = useStore.getState().tasks[0];
    expect(t.done).toBe(false);
    useStore.getState().toggleTask(t.id);
    expect(useStore.getState().tasks[0].done).toBe(true);
    useStore.getState().toggleTask(t.id);
    expect(useStore.getState().tasks[0].done).toBe(false);
    useStore.getState().deleteTask(t.id);
    expect(useStore.getState().tasks).toHaveLength(0);
  });
});

describe("Persistência offline (fila local + ressincronização)", () => {
  it("sem login: itens ficam pendentes (synced:false) localmente", async () => {
    useStore.getState().addNote("x", null);
    await useStore.getState().flushPending();
    expect(upsert).not.toHaveBeenCalled();
    expect(useStore.getState().notes[0].synced).toBe(false);
  });

  it("falha de rede: mantém pendente e NÃO perde dados; ao voltar, sincroniza", async () => {
    useStore.setState({ userId: "u1" });
    upsert.mockResolvedValue({ error: new Error("offline") });
    useStore.getState().addTask("t", null);
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    await useStore.getState().flushPending();
    expect(useStore.getState().tasks[0].synced).toBe(false);

    upsert.mockResolvedValue({ error: null });
    await useStore.getState().flushPending();
    expect(useStore.getState().tasks[0].synced).toBe(true);
  });

  it("navigator.onLine=false: nem tenta enviar", async () => {
    useStore.setState({ userId: "u1" });
    vi.stubGlobal("navigator", { onLine: false });
    useStore.getState().addNote("x", null);
    await useStore.getState().flushPending();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("sessões enviadas não contêm o campo local 'synced' e levam user_id", async () => {
    useStore.setState({ userId: "u1" });
    useStore.getState().updateSettings({ focusMin: 1 });
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(61));
    useStore.getState().tick();
    await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    const row = upsert.mock.calls[0][0][0];
    expect(row).not.toHaveProperty("synced");
    expect(row.user_id).toBe("u1");
    expect(row.subject).toBeTruthy();
  });

  it("persist: grava no localStorage e não salva calendarEvents nem funções", async () => {
    useStore.setState({
      calendarEvents: [{ id: "1", summary: "x", start: 0, end: 1 }],
    });
    useStore.getState().addNote("persistir", null);
    const raw = JSON.parse(localStorage.getItem("foco-store")!);
    expect(raw.state.notes[0].content).toBe("persistir");
    expect(raw.state).not.toHaveProperty("calendarEvents");
    expect(Object.values(raw.state).every((v) => typeof v !== "function")).toBe(true);
  });
});

describe("Resiliência do Google Calendar", () => {
  const events = (now: number) => ({
    items: [
      { id: "a", summary: "Física", start: { dateTime: new Date(now - min(10)).toISOString() }, end: { dateTime: new Date(now + min(20)).toISOString() } },
      { id: "b", summary: "Dia inteiro", start: { date: "2026-10-08" }, end: { date: "2026-10-09" } },
    ],
  });

  it("sugere a matéria do evento atual (e ignora eventos de dia inteiro)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => events(Date.now()) }));
    useStore.setState({ providerToken: "tok", subjectManual: false });
    await useStore.getState().refreshCalendar();
    const s = useStore.getState();
    expect(s.calendarEvents).toHaveLength(1);
    expect(s.subject).toBe("Física");
    expect(s.subjects).toContain("Física");
  });

  it("não sobrescreve matéria escolhida manualmente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => events(Date.now()) }));
    useStore.setState({ providerToken: "tok", subject: "HTML", subjectManual: true });
    await useStore.getState().refreshCalendar();
    expect(useStore.getState().subject).toBe("HTML");
  });

  it("token expirado (401): não quebra, limpa token, avisa e o timer segue funcionando", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    useStore.setState({ providerToken: "tok" });
    await expect(useStore.getState().refreshCalendar()).resolves.toBeUndefined();
    expect(useStore.getState().providerToken).toBeNull();
    expect(toast.warning).toHaveBeenCalled();
    useStore.getState().start();
    expect(useStore.getState().status).toBe("running");
  });

  it("API fora do ar (500/rede): não quebra e mantém o token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    useStore.setState({ providerToken: "tok" });
    await expect(useStore.getState().refreshCalendar()).resolves.toBeUndefined();
    expect(useStore.getState().providerToken).toBe("tok");
    expect(toast.warning).toHaveBeenCalled();
  });

  it("autosave: cria evento 'Estudo: matéria' ao concluir foco; falha da API não quebra", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", f);
    useStore.setState({ providerToken: "tok", userId: "u1", subject: "HTML" });
    useStore.getState().updateSettings({ focusMin: 1, autoSaveCalendar: true });
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(61));
    useStore.getState().tick();
    const post = f.mock.calls.find((c) => c[1]?.method === "POST");
    expect(post).toBeTruthy();
    expect(JSON.parse(post![1].body).summary).toBe("Estudo: HTML");

    f.mockRejectedValue(new Error("down"));
    useStore.getState().setPhase("focus");
    useStore.getState().start();
    vi.setSystemTime(T0 + sec(200));
    expect(() => useStore.getState().tick()).not.toThrow();
  });
});
