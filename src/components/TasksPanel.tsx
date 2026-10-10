"use client";

import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Trash2, Calendar, Tag, CheckSquare, Clock, FileText, Check, Flag, AlignLeft, Repeat, Archive } from "lucide-react";
import { useStore } from "@/store/useStore";
import SubjectPicker from "./SubjectPicker";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanTaskExtras, Priority, Recurrence, Task, PropType, PropDef } from "@/lib/types";
import {
  DEFAULT_EXTRAS,
  EMPTY_KANBAN,
  PRIORITIES,
  RECURRENCES,
  TAG_PALETTE,
  allTags,
  priorityOf,
  sortByOrder,
  tagClass,
  toFull,
  type FullTask,
} from "@/lib/kanban";

type Status = KanbanTaskExtras["status"];

const COLUMNS: { id: Status; title: string; pill: string; dot: string; bg: string; card: string; addText: string }[] = [
  { id: "todo", title: "A fazer", pill: "bg-[rgba(120,120,120,0.35)] text-zinc-200", dot: "bg-zinc-400", bg: "bg-white/[0.04]", card: "bg-[#252525] border-white/10", addText: "text-zinc-400" },
  { id: "in_progress", title: "Fazendo", pill: "bg-[rgba(46,117,196,0.35)] text-sky-200", dot: "bg-sky-400", bg: "bg-sky-500/[0.07]", card: "bg-[#1f2a37] border-sky-300/10", addText: "text-sky-400" },
  { id: "done", title: "Feito", pill: "bg-[rgba(46,160,110,0.35)] text-emerald-200", dot: "bg-emerald-400", bg: "bg-emerald-500/[0.08]", card: "bg-[#243629] border-emerald-300/10", addText: "text-emerald-400" },
];


const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
};

function CardBody({ task, dragging = false }: { task: FullTask; dragging?: boolean }) {
  const col = COLUMNS.find((c) => c.id === task.status) ?? COLUMNS[0];
  const doneSub = task.subtasks.filter((s) => s.done).length;
  const tagColors = useStore((s) => s.settings.kanban?.tagColors);
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 shadow-sm transition ${col.card} ${
        dragging ? "rotate-2 shadow-2xl ring-1 ring-white/20" : "hover:brightness-125"
      }`}
    >
      <div className="flex items-start gap-2">
        <FileText size={15} className="mt-0.5 shrink-0 text-zinc-400" />
        <span className={`text-sm font-semibold leading-snug ${task.status === "done" ? "text-zinc-300" : "text-zinc-50"}`}>
          {task.title}
        </span>
      </div>
      {(task.description || task.tags.length > 0 || task.subtasks.length > 0 || priorityOf(task.priority).id !== "none") && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {priorityOf(task.priority).id !== "none" && (
            <span
              data-testid="priority-chip"
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${priorityOf(task.priority).chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${priorityOf(task.priority).dot}`} />
              {priorityOf(task.priority).label}
            </span>
          )}
          {task.description && (
            <span className="flex items-center text-zinc-400" title="Possui descrição">
              <AlignLeft size={13} />
            </span>
          )}
          {task.tags.map((t) => (
            <span key={t} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tagClass(t, tagColors)}`}>
              {t}
            </span>
          ))}
          {task.subtasks.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-zinc-400">
              <CheckSquare size={11} /> {doneSub}/{task.subtasks.length}
            </span>
          )}
        </div>
      )}
      {task.dueDate && <div className="mt-2 text-[11px] text-zinc-300">{fmtDate(task.dueDate)}</div>}
    </div>
  );
}

function DraggableCard({ task, onOpen }: { task: FullTask; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`cursor-grab touch-none select-none active:cursor-grabbing ${isDragging ? "opacity-30" : ""}`}
    >
      <CardBody task={task} />
    </div>
  );
}

function Column({
  col,
  tasks,
  onOpen,
  onAdd,
  onArchive,
}: {
  col: (typeof COLUMNS)[number];
  tasks: FullTask[];
  onOpen: (id: string) => void;
  onAdd: (title: string) => void;
  onArchive?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.id}` });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const commit = () => {
    if (title.trim()) onAdd(title);
    setTitle("");
    setAdding(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[272px] shrink-0 flex-col self-start rounded-xl p-2 transition ${col.bg} ${
        isOver ? "ring-1 ring-white/25" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${col.pill}`}>
            <span className={`h-2 w-2 rounded-full ${col.dot}`} />
            {col.title}
          </span>
          <span className="text-xs text-zinc-500">{tasks.length}</span>
        </div>
        {col.id === "done" && tasks.length > 0 && onArchive && (
          <button onClick={onArchive} className="text-[10px] uppercase tracking-wider text-muted hover:text-fg" title="Arquivar concluídas">
            Limpar
          </button>
        )}
      </div>

      <div className="flex min-h-[8px] flex-col gap-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <DraggableCard key={t.id} task={t} onOpen={() => onOpen(t.id)} />
          ))}
        </SortableContext>

        {adding ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setTitle("");
                setAdding(false);
              }
            }}
            placeholder="Título da página…"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-zinc-500"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className={`flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5 ${col.addText}`}
          >
            <Plus size={14} /> Nova página
          </button>
        )}
      </div>
    </div>
  );
}

function TaskModal({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const allTasks = useStore((s) => s.tasks);
  const extras = useStore((s) => s.settings.kanban?.taskExtras[taskId]);
  const updateKanbanTask = useStore((s) => s.updateKanbanTask);
  const moveKanbanTask = useStore((s) => s.moveKanbanTask);
  const setTagColor = useStore((s) => s.setTagColor);
  const kanban = useStore((s) => s.settings.kanban) ?? EMPTY_KANBAN;
  const tagColors = kanban.tagColors;
  const listDefs = kanban.propDefs?.[extras?.listId ?? ""] ?? [];
  const addKanbanPropDef = useStore((s) => s.addKanbanPropDef);
  const deleteKanbanPropDef = useStore((s) => s.deleteKanbanPropDef);
  const deleteTask = useStore((s) => s.deleteTask);
  const focusOnTask = useStore((s) => s.focusOnTask);
  const base = allTasks.find((t) => t.id === taskId);

  const [title, setTitle] = useState(base?.title ?? "");
  const [newSub, setNewSub] = useState("");
  const [newTag, setNewTag] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);

  const [addingProp, setAddingProp] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState<PropType>("text");
  const [newPropOptions, setNewPropOptions] = useState("");

  if (!base) return null;
  if (!mounted) return null;
  const x = extras ?? DEFAULT_EXTRAS;
  const doneSub = x.subtasks.filter((s) => s.done).length;
  const pct = x.subtasks.length ? Math.round((doneSub / x.subtasks.length) * 100) : 0;

  // Cada alteração é gravada no store na hora (sem cópia local que possa se perder).
  const patch = (p: Partial<Task & KanbanTaskExtras>) => updateKanbanTask(taskId, p);

  const addSub = () => {
    if (!newSub.trim()) return;
    patch({ subtasks: [...x.subtasks, { id: crypto.randomUUID(), title: newSub.trim(), done: false }] });
    setNewSub("");
  };
  const addTag = (raw?: string) => {
    const t = (raw ?? newTag).trim();
    if (t && !x.tags.includes(t)) patch({ tags: [...x.tags, t] });
    setNewTag("");
  };
  const suggestions = allTags(allTasks, kanban).filter((g) => !x.tags.includes(g));

  const handleAddProp = () => {
    if (!newPropName.trim()) return;
    const def: PropDef = {
      id: crypto.randomUUID(),
      name: newPropName.trim(),
      type: newPropType,
      options: newPropType === "select" ? newPropOptions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    };
    addKanbanPropDef(x.listId, def);
    setAddingProp(false);
    setNewPropName("");
    setNewPropOptions("");
  };

  const setPropValue = (propId: string, val: string) => {
    patch({ props: { ...(x.props ?? {}), [propId]: val } });
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <header className="mb-5 flex items-start gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== base.title && patch({ title: title.trim() })}
            className="w-full bg-transparent text-2xl font-semibold outline-none"
            placeholder="Título da tarefa"
          />
          <button
            onClick={() => {
              if (title.trim() && title !== base.title) patch({ title: title.trim() });
              onClose();
            }}
            aria-label="Fechar"
            className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg"
          >
            <X size={20} />
          </button>
        </header>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex w-24 shrink-0 items-center gap-2 text-muted"><Clock size={15} /> Status</div>
            <select
              value={x.status}
              onChange={(e) => moveKanbanTask(taskId, e.target.value as Status, null)}
              className="rounded bg-surface2 px-2 py-1 outline-none"
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex w-24 shrink-0 items-center gap-2 text-muted"><Flag size={15} /> Prioridade</div>
            <select
              aria-label="Prioridade"
              value={x.priority ?? "none"}
              onChange={(e) => patch({ priority: e.target.value as Priority })}
              className="rounded bg-surface2 px-2 py-1 outline-none"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex w-24 shrink-0 items-center gap-2 text-muted"><Repeat size={15} /> Repetição</div>
            <select
              aria-label="Repetição"
              value={x.recurrence ?? "none"}
              onChange={(e) => patch({ recurrence: e.target.value as Recurrence })}
              className="rounded bg-surface2 px-2 py-1 outline-none"
            >
              {RECURRENCES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>


          <div className="flex items-center gap-4">
            <div className="flex w-24 shrink-0 items-center gap-2 text-muted"><Calendar size={15} /> Prazo</div>
            <input
              type="date"
              value={x.dueDate ?? ""}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
              className="rounded bg-surface2 px-2 py-1 outline-none"
            />
          </div>

          <div className="flex items-start gap-4">
            <div className="mt-1 flex w-24 shrink-0 items-center gap-2 text-muted"><AlignLeft size={15} /> Descrição</div>
            <textarea
              value={x.description ?? ""}
              onChange={(e) => patch({ description: e.target.value })}
              className="w-full min-h-[80px] rounded bg-surface2 px-3 py-2 text-sm outline-none placeholder:text-muted/60 resize-y"
              placeholder="Adicionar descrição detalhada..."
            />
          </div>

          <div className="flex items-start gap-4">
            <div className="mt-1 flex w-24 shrink-0 items-center gap-2 text-muted"><Tag size={15} /> Tags</div>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {x.tags.map((t) => (
                  <span key={t} className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${tagClass(t, tagColors)}`}>
                    <button
                      onClick={() => setColorFor(colorFor === t ? null : t)}
                      aria-label={`Cor da tag ${t}`}
                      title="Mudar cor"
                    >
                      {t}
                    </button>
                    <button onClick={() => patch({ tags: x.tags.filter((g) => g !== t) })} aria-label={`Remover ${t}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  onBlur={() => addTag()}
                  placeholder="Nova tag + Enter"
                  className="min-w-[110px] rounded bg-surface2 px-2 py-1 text-xs outline-none"
                />
              </div>
              {colorFor && x.tags.includes(colorFor) && (
                <div className="flex items-center gap-1.5" aria-label={`Cores para ${colorFor}`}>
                  <span className="text-xs text-muted">Cor de “{colorFor}”:</span>
                  {TAG_PALETTE.map((cls, i) => (
                    <button
                      key={i}
                      onClick={() => setTagColor(colorFor, i)}
                      aria-label={`Cor ${i + 1}`}
                      className={`h-5 w-5 rounded-full ${cls.split(" ")[0]} ring-offset-1 ring-offset-surface transition hover:scale-110 ${
                        tagClass(colorFor, tagColors) === cls ? "ring-2 ring-white/70" : ""
                      }`}
                    />
                  ))}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">Existentes:</span>
                  {suggestions.map((g) => (
                    <button
                      key={g}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addTag(g)}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 ${tagClass(g, tagColors)}`}
                    >
                      + {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {listDefs.map((def) => {
            const val = x.props?.[def.id] ?? "";
            return (
              <div key={def.id} className="flex items-center gap-4 group">
                <div className="flex w-24 shrink-0 items-center gap-2 text-muted">
                  <span className="truncate" title={def.name}>{def.name}</span>
                </div>
                {def.type === "text" && (
                  <input
                    value={val}
                    onChange={(e) => setPropValue(def.id, e.target.value)}
                    placeholder="Vazio"
                    className="flex-1 rounded bg-transparent px-2 py-1 outline-none hover:bg-surface2 focus:bg-surface2"
                  />
                )}
                {def.type === "number" && (
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setPropValue(def.id, e.target.value)}
                    placeholder="Vazio"
                    className="rounded bg-transparent px-2 py-1 outline-none hover:bg-surface2 focus:bg-surface2 w-32"
                  />
                )}
                {def.type === "date" && (
                  <input
                    type="date"
                    value={val}
                    onChange={(e) => setPropValue(def.id, e.target.value)}
                    className="rounded bg-transparent px-2 py-1 outline-none hover:bg-surface2 focus:bg-surface2 w-40"
                  />
                )}
                {def.type === "select" && (
                  <select
                    value={val}
                    onChange={(e) => setPropValue(def.id, e.target.value)}
                    className="rounded bg-transparent px-2 py-1 outline-none hover:bg-surface2 focus:bg-surface2 w-48"
                  >
                    <option value="">Vazio</option>
                    {def.options?.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => {
                    if (confirm(`Remover propriedade "${def.name}" da lista? Isso apagará o valor em todas as tarefas.`)) {
                      deleteKanbanPropDef(x.listId, def.id);
                    }
                  }}
                  className="text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                  title="Remover propriedade"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}

          <div className="flex items-center gap-4 pt-2">
            {!addingProp ? (
              <button
                onClick={() => setAddingProp(true)}
                className="flex items-center gap-2 text-sm text-muted hover:text-fg transition ml-28"
              >
                <Plus size={14} /> Adicionar propriedade
              </button>
            ) : (
              <div className="ml-28 flex flex-col gap-2 rounded-lg border border-line p-3 bg-surface2">
                <input
                  autoFocus
                  placeholder="Nome da propriedade"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  className="rounded bg-black/20 px-2 py-1 text-sm outline-none"
                />
                <select
                  value={newPropType}
                  onChange={(e) => setNewPropType(e.target.value as PropType)}
                  className="rounded bg-black/20 px-2 py-1 text-sm outline-none"
                >
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="select">Seleção (Múltipla escolha)</option>
                  <option value="date">Data</option>
                </select>
                {newPropType === "select" && (
                  <input
                    placeholder="Opções separadas por vírgula"
                    value={newPropOptions}
                    onChange={(e) => setNewPropOptions(e.target.value)}
                    className="rounded bg-black/20 px-2 py-1 text-sm outline-none"
                  />
                )}
                <div className="flex justify-end gap-2 mt-1">
                  <button onClick={() => setAddingProp(false)} className="text-xs text-muted hover:text-fg">Cancelar</button>
                  <button onClick={handleAddProp} className="text-xs text-accent-fg bg-accent px-2 py-1 rounded">Adicionar</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted">
            <CheckSquare size={15} /> Sub-tarefas
            {x.subtasks.length > 0 && <span className="text-xs">({doneSub}/{x.subtasks.length})</span>}
          </h3>
          {x.subtasks.length > 0 && (
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <ul className="mb-2 space-y-1.5">
            {x.subtasks.map((st) => (
              <li key={st.id} className="group flex items-center gap-3">
                <button
                  role="checkbox"
                  aria-checked={st.done}
                  onClick={() =>
                    patch({ subtasks: x.subtasks.map((s) => (s.id === st.id ? { ...s, done: !s.done } : s)) })
                  }
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
                    st.done ? "border-accent bg-accent text-accent-fg" : "border-line hover:border-accent"
                  }`}
                >
                  {st.done && <Check size={11} strokeWidth={3} />}
                </button>
                <input
                  defaultValue={st.title}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== st.title)
                      patch({ subtasks: x.subtasks.map((s) => (s.id === st.id ? { ...s, title: v } : s)) });
                  }}
                  className={`flex-1 bg-transparent text-sm outline-none ${st.done ? "text-muted line-through" : ""}`}
                />
                <button
                  onClick={() => patch({ subtasks: x.subtasks.filter((s) => s.id !== st.id) })}
                  aria-label="Remover sub-tarefa"
                  className="text-muted opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-muted" />
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub())}
              placeholder="Adicionar sub-tarefa e pressionar Enter…"
              className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
            />
          </div>
        </section>

        <footer className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => {
                deleteTask(taskId);
                onClose();
              }}
              className="flex items-center gap-2 text-sm text-red-400 hover:brightness-125"
            >
              <Trash2 size={15} /> Excluir
            </button>
            <button
              onClick={() => {
                patch({ archived: true });
                onClose();
              }}
              className="flex items-center gap-2 text-sm text-muted hover:text-fg"
            >
              <Archive size={15} /> Arquivar
            </button>
            <button
              onClick={() => {
                focusOnTask(taskId);
                onClose();
              }}
              className="flex items-center gap-2 text-sm text-sky-400 hover:brightness-125 sm:ml-2"
            >
              <Clock size={15} /> Focar
            </button>
            {x.focusSec ? (
              <span className="text-xs text-muted sm:ml-2">({Math.round(x.focusSec / 60)} min)</span>
            ) : null}
          </div>
          <button
            onClick={() => {
              if (title.trim() && title !== base.title) patch({ title: title.trim() });
              onClose();
            }}
            className="w-full sm:w-auto rounded-lg bg-accent px-5 py-1.5 text-sm font-medium text-accent-fg hover:brightness-110"
          >
            Concluir
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// Prioriza cartões sob o ponteiro (reordenar); depois a coluna; por fim interseção de retângulos.
const collision: CollisionDetection = (args) => {
  const p = pointerWithin(args);
  const cards = p.filter((c) => !String(c.id).startsWith("col:"));
  if (cards.length) return cards;
  return p.length ? p : rectIntersection(args);
};

export default function TasksPanel() {
  const allTasks = useStore((s) => s.tasks);
  const userId = useStore((s) => s.userId);
  const kanbanRaw = useStore((s) => s.settings.kanban);
  const addKanbanTask = useStore((s) => s.addKanbanTask);
  const moveKanbanTask = useStore((s) => s.moveKanbanTask);
  const archiveKanbanTasks = useStore((s) => s.archiveKanbanTasks);
  const addTaskList = useStore((s) => s.addTaskList);
  const deleteTaskList = useStore((s) => s.deleteTaskList);

  const kanban = useMemo(() => kanbanRaw ?? EMPTY_KANBAN, [kanbanRaw]);

  const [activeListId, setActiveListId] = useState("default");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

  const listId = kanban.lists.some((l) => l.id === activeListId) ? activeListId : kanban.lists[0]?.id ?? "default";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const tasks: FullTask[] = useMemo(
    () =>
      sortByOrder(
        allTasks
          .filter((t) => !t.deleted_at && (!t.user_id || t.user_id === userId))
          .map((t) => toFull(t, kanban))
          .filter((t) => t.listId === listId && !t.archived)
      ),
    [allTasks, userId, kanban, listId]
  );

  const dragged = dragId ? tasks.find((t) => t.id === dragId) : null;

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    if (!e.over) return;
    const id = String(e.active.id);
    const overId = String(e.over.id);
    if (overId.startsWith("col:")) {
      moveKanbanTask(id, overId.slice(4) as Status, null);
      return;
    }
    const target = tasks.find((x) => x.id === overId);
    if (target && overId !== id) moveKanbanTask(id, target.status, overId);
  };

  const commitList = () => {
    if (newListName.trim()) addTaskList(newListName);
    setNewListName("");
    setAddingList(false);
  };

  return (
    <section className="fade-up mx-auto w-full max-w-5xl" aria-label="Tarefas">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-light">Tarefas</h2>
        <SubjectPicker compact />
      </div>

      {/* Listas (estilo Google Tarefas) */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {kanban.lists.map((l) => (
          <div key={l.id} className="group relative">
            <button
              onClick={() => setActiveListId(l.id)}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                listId === l.id ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:text-fg"
              }`}
            >
              {l.name}
            </button>
            {l.id !== "default" && (
              <button
                onClick={() => {
                  if (confirm(`Excluir a lista "${l.name}"?`)) deleteTaskList(l.id);
                }}
                aria-label={`Excluir lista ${l.name}`}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full bg-surface2 text-muted hover:text-red-400 group-hover:grid"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {addingList ? (
          <input
            autoFocus
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onBlur={commitList}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitList();
              if (e.key === "Escape") {
                setNewListName("");
                setAddingList(false);
              }
            }}
            placeholder="Nome da lista"
            className="rounded-full border border-line bg-transparent px-4 py-1.5 text-sm outline-none focus:border-accent"
          />
        ) : (
          <button
            onClick={() => setAddingList(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-muted transition hover:text-fg"
          >
            <Plus size={14} /> Nova lista
          </button>
        )}
      </div>

      {/* Quadro Kanban */}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div className="mt-6 flex items-start gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              col={col}
              tasks={tasks.filter((t) => t.status === col.id)}
              onOpen={setOpenId}
              onAdd={(title) => addKanbanTask(title, listId, col.id)}
              onArchive={col.id === "done" ? () => archiveKanbanTasks(listId) : undefined}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180 }}>{dragged ? <CardBody task={dragged} dragging /> : null}</DragOverlay>
      </DndContext>

      {openId && <TaskModal key={openId} taskId={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}
