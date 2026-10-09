import type { KanbanData, KanbanTaskExtras, Task } from "./types";

export const EMPTY_KANBAN: KanbanData = { lists: [{ id: "default", name: "Geral" }], taskExtras: {} };

export const DEFAULT_EXTRAS: KanbanTaskExtras = {
  status: "todo",
  listId: "default",
  subtasks: [],
  tags: [],
  dueDate: null,
};

export type FullTask = Task & KanbanTaskExtras;

/** Junta a tarefa do banco com seus extras do Kanban. */
export function toFull(t: Task, kanban: KanbanData): FullTask {
  return { ...t, ...DEFAULT_EXTRAS, ...(kanban.taskExtras[t.id] ?? {}) };
}

/**
 * Ordena por `order`. Tarefas antigas (sem order) vêm primeiro, por data de criação —
 * assim nada some nem muda de lugar para quem já tinha tarefas.
 */
export function sortByOrder<T extends { order?: number; created_at: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    if (ao === undefined && bo === undefined) return a.created_at.localeCompare(b.created_at);
    if (ao === undefined) return -1;
    if (bo === undefined) return 1;
    return ao - bo;
  });
}

/**
 * Calcula a nova ordem de ids de uma coluna após soltar `movingId` sobre `overId`.
 * - mesma coluna: comportamento de arrayMove (soltar sobre um item assume a posição dele)
 * - outra coluna: entra antes do item `overId`; sem `overId` vai para o fim.
 */
export function placeInColumn(ids: string[], movingId: string, overId: string | null): string[] {
  const oldIdx = ids.indexOf(movingId);
  const overIdx = overId ? ids.indexOf(overId) : -1;
  const without = ids.filter((i) => i !== movingId);
  if (oldIdx !== -1) {
    if (overIdx === -1 || overId === movingId) return ids;
    const out = [...without];
    out.splice(overIdx, 0, movingId); // arrayMove
    return out;
  }
  if (overIdx === -1) return [...without, movingId];
  const out = [...without];
  out.splice(overIdx, 0, movingId);
  return out;
}

/** Próximo valor de `order` (fim de qualquer coluna). */
export function nextOrder(kanban: KanbanData): number {
  let max = -1;
  for (const e of Object.values(kanban.taskExtras)) if (typeof e.order === "number" && e.order > max) max = e.order;
  return max + 1;
}

/* ───────────── Tags: cores e reaproveitamento ───────────── */

export const TAG_PALETTE = [
  "bg-[#8a4b2f] text-orange-100",
  "bg-[#8a6d1f] text-yellow-100",
  "bg-[#2f6a8a] text-sky-100",
  "bg-[#5b3f8a] text-violet-100",
  "bg-[#2f7a55] text-emerald-100",
  "bg-[#8a3f62] text-pink-100",
  "bg-[#5f5f5f] text-zinc-100",
  "bg-[#8a2f2f] text-red-100",
] as const;

/** Cor da tag: escolhida pelo usuário ou derivada do nome (estável). */
export function tagColorIndex(tag: string, tagColors?: Record<string, number>): number {
  const chosen = tagColors?.[tag];
  if (typeof chosen === "number" && chosen >= 0 && chosen < TAG_PALETTE.length) return chosen;
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % TAG_PALETTE.length;
}

export const tagClass = (tag: string, tagColors?: Record<string, number>) =>
  TAG_PALETTE[tagColorIndex(tag, tagColors)];

/** Todas as tags já usadas em tarefas ativas (únicas, ordem alfabética). */
export function allTags(tasks: { deleted_at?: string | null; id: string }[], kanban: KanbanData): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.deleted_at) continue;
    for (const g of kanban.taskExtras[t.id]?.tags ?? []) set.add(g);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/* ───────────── Prioridade ───────────── */

import type { Priority } from "./types";

export const PRIORITIES: { id: Priority; label: string; dot: string; chip: string; rank: number }[] = [
  { id: "none", label: "Sem prioridade", dot: "bg-zinc-500", chip: "bg-zinc-600/40 text-zinc-300", rank: 0 },
  { id: "low", label: "Baixa", dot: "bg-sky-400", chip: "bg-sky-500/25 text-sky-200", rank: 1 },
  { id: "medium", label: "Média", dot: "bg-amber-400", chip: "bg-amber-500/25 text-amber-200", rank: 2 },
  { id: "high", label: "Alta", dot: "bg-red-400", chip: "bg-red-500/25 text-red-200", rank: 3 },
];

export const priorityOf = (p?: Priority) => PRIORITIES.find((x) => x.id === (p ?? "none")) ?? PRIORITIES[0];

/* ───────────── Recorrência ───────────── */

import type { Recurrence } from "./types";

export const RECURRENCES: { id: Recurrence; label: string }[] = [
  { id: "none", label: "Não repete" },
  { id: "daily", label: "Diariamente" },
  { id: "weekly", label: "Semanalmente" },
  { id: "monthly", label: "Mensalmente" },
];

export function getNextRecurrenceDate(due: string | null | undefined, recurrence: Recurrence): string | null {
  if (!due || recurrence === "none") return null;
  const [y, m, d] = due.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (recurrence === "daily") date.setDate(date.getDate() + 1);
  else if (recurrence === "weekly") date.setDate(date.getDate() + 7);
  else if (recurrence === "monthly") date.setMonth(date.getMonth() + 1);
  
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/* ───────────── Prazos e ordenação ───────────── */

/** Data local de hoje no formato YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Vencida = tem prazo anterior a hoje e ainda não está concluída. */
export function isOverdue(due: string | null | undefined, status: KanbanTaskExtras["status"], today = todayISO()): boolean {
  return !!due && status !== "done" && due < today;
}

export type SortMode = "manual" | "due" | "priority";

/** Ordena a coluna. "manual" respeita o arrastar; os demais são ordenações de visualização. */
export function sortTasks<T extends { order?: number; created_at: string; dueDate?: string | null; priority?: Priority }>(
  arr: T[],
  mode: SortMode
): T[] {
  const manual = sortByOrder(arr);
  if (mode === "manual") return manual;
  const idx = new Map(manual.map((t, i) => [t, i]));
  const tie = (a: T, b: T) => (idx.get(a) ?? 0) - (idx.get(b) ?? 0);
  if (mode === "due") {
    // sem prazo vai para o fim
    return [...manual].sort((a, b) => {
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      return ad === bd ? tie(a, b) : ad < bd ? -1 : 1;
    });
  }
  return [...manual].sort((a, b) => {
    const diff = priorityOf(b.priority).rank - priorityOf(a.priority).rank;
    return diff !== 0 ? diff : tie(a, b);
  });
}
