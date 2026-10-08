import type { AlarmSound } from "./types";

let ctx: AudioContext | null = null;

/**
 * Anti-bug #2 (autoplay): deve ser chamada DENTRO de um handler de clique
 * (ex.: botão "Iniciar"). Cria/retoma o AudioContext e toca 1 frame mudo,
 * o que "desbloqueia" o áudio para o alarme posterior (sem gesto do usuário).
 */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* áudio indisponível: o timer segue funcionando */
  }
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function playAlarm(sound: AlarmSound, volume: number) {
  if (!ctx) unlockAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const v = Math.min(Math.max(volume, 0), 1) * 0.6;
  if (sound === "bell") {
    [0, 1.2, 2.4].forEach((s) => {
      tone(880, s, 1.4, v, "sine");
      tone(1760, s, 0.9, v * 0.4, "sine");
    });
  } else if (sound === "digital") {
    for (let i = 0; i < 6; i++) tone(i % 2 ? 1200 : 1000, i * 0.2, 0.15, v, "square");
  } else {
    for (let i = 0; i < 3; i++) tone(660, i * 0.5, 0.3, v, "triangle");
  }
}
