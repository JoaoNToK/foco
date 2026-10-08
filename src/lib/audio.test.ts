import { beforeEach, describe, expect, it, vi } from "vitest";

type Node = {
  type: string;
  frequency: { value: number };
  connect: (n: unknown) => unknown;
  start: () => void;
  stop: () => void;
};

const created: Node[] = [];
const resume = vi.fn();
let state = "suspended";
let ctorCalls = 0;

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  get state() {
    return state;
  }
  constructor() {
    ctorCalls++;
  }
  resume() {
    state = "running";
    resume();
    return Promise.resolve();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { buffer: null, connect: vi.fn(), start: vi.fn() };
  }
  createGain() {
    const g = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n };
    return g;
  }
  createOscillator() {
    const o: Node = { type: "", frequency: { value: 0 }, connect: (n) => n, start: vi.fn(), stop: vi.fn() };
    created.push(o);
    return o;
  }
}

beforeEach(() => {
  vi.resetModules();
  created.length = 0;
  resume.mockClear();
  state = "suspended";
  ctorCalls = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});

describe("Áudio (anti-bloqueio de autoplay)", () => {
  it("unlockAudio cria o contexto uma vez e o retoma (resume)", async () => {
    const { unlockAudio } = await import("./audio");
    unlockAudio();
    unlockAudio();
    expect(ctorCalls).toBe(1);
    expect(resume).toHaveBeenCalled();
  });

  it("playAlarm gera osciladores para cada som", async () => {
    const { unlockAudio, playAlarm } = await import("./audio");
    unlockAudio();
    playAlarm("bell", 0.5);
    expect(created.length).toBe(6);
    created.length = 0;
    playAlarm("digital", 0.5);
    expect(created.length).toBe(6);
    expect(created[0].type).toBe("square");
    created.length = 0;
    playAlarm("beep", 0.5);
    expect(created.length).toBe(3);
  });

  it("playAlarm sem unlock prévio ainda tenta criar/retomar o contexto", async () => {
    const { playAlarm } = await import("./audio");
    playAlarm("beep", 1);
    expect(ctorCalls).toBe(1);
    expect(created.length).toBe(3);
  });

  it("sem suporte a AudioContext não lança erro", async () => {
    vi.stubGlobal("AudioContext", undefined);
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    const { unlockAudio, playAlarm } = await import("./audio");
    expect(() => unlockAudio()).not.toThrow();
    expect(() => playAlarm("bell", 1)).not.toThrow();
  });
});
