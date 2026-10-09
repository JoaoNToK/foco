"use client";

import { useState } from "react";
import { Plus, X, List as ListIcon, Trash2, Calendar, Tag, CheckSquare, Clock } from "lucide-react";
import { useStore } from "@/store/useStore";
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, KanbanTaskExtras, Subtask } from "@/lib/types";

// Tipagem unida para o Kanban
type FullTask = Task & KanbanTaskExtras;

function TaskCard({ task, onClick }: { task: FullTask; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const completedSubtasks = task.subtasks.filter(st => st.done).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="group flex cursor-grab flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm hover:border-accent active:cursor-grabbing"
    >
      <span className={`text-sm font-medium ${task.done ? "text-muted line-through" : "text-fg"}`}>{task.title}</span>
      
      {(task.tags.length > 0 || task.dueDate || task.subtasks.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {task.dueDate && (
            <span className="flex items-center gap-1 rounded bg-surface2 px-1.5 py-0.5">
              <Calendar size={12} /> {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="flex items-center gap-1 rounded bg-surface2 px-1.5 py-0.5">
              <CheckSquare size={12} /> {completedSubtasks}/{task.subtasks.length}
            </span>
          )}
          {task.tags.map((tag, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-surface2 px-1.5 py-0.5 text-accent">
              <Tag size={12} /> {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksPanel() {
  const allTasks = useStore((s) => s.tasks);
  const userId = useStore((s) => s.userId);
  const kanban = useStore((s) => s.settings.kanban) ?? { lists: [{ id: "default", name: "Geral" }], taskExtras: {} };
  const addKanbanTask = useStore((s) => s.addKanbanTask);
  const updateKanbanTask = useStore((s) => s.updateKanbanTask);
  const addTaskList = useStore((s) => s.addTaskList);
  const deleteTaskList = useStore((s) => s.deleteTaskList);
  const deleteTask = useStore((s) => s.deleteTask);

  const [activeListId, setActiveListId] = useState(kanban.lists[0]?.id || "default");
  const [editingTask, setEditingTask] = useState<FullTask | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Filtrar e construir as tarefas da lista ativa
  const activeTasks: FullTask[] = allTasks
    .filter((t) => !t.deleted_at && (!t.user_id || t.user_id === userId))
    .map((t) => {
      const extras = kanban.taskExtras[t.id] ?? { status: "todo", listId: "default", subtasks: [], tags: [], dueDate: null };
      return { ...t, ...extras };
    })
    .filter((t) => t.listId === activeListId);

  const columns = [
    { id: "todo", title: "A fazer", color: "bg-surface" },
    { id: "in_progress", title: "Fazendo", color: "bg-surface" },
    { id: "done", title: "Feito", color: "bg-surface" }
  ] as const;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    // Apenas lidando com mudança de status (coluna) para simplificar
    const activeTask = activeTasks.find(t => t.id === active.id);
    if (!activeTask) return;
    
    // Se soltou sobre uma coluna vazia (id da coluna) ou sobre um item (buscamos a coluna do item)
    const overId = over.id as string;
    let newStatus = activeTask.status;
    
    if (["todo", "in_progress", "done"].includes(overId)) {
      newStatus = overId as any;
    } else {
      const overTask = activeTasks.find(t => t.id === overId);
      if (overTask) newStatus = overTask.status;
    }

    if (newStatus !== activeTask.status) {
      updateKanbanTask(activeTask.id, { status: newStatus, done: newStatus === "done" });
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full max-w-7xl mx-auto gap-6 overflow-hidden rounded-2xl bg-bg">
      {/* Sidebar de Listas */}
      <aside className="w-64 flex flex-col border-r border-line bg-surface/30 p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted flex items-center gap-2">
          <ListIcon size={16} /> Listas
        </h2>
        <ul className="flex-1 space-y-1 overflow-y-auto">
          {kanban.lists.map((list) => (
            <li key={list.id} className="group flex items-center justify-between">
              <button
                onClick={() => setActiveListId(list.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  activeListId === list.id ? "bg-accent/10 text-accent" : "text-fg hover:bg-surface"
                }`}
              >
                {list.name}
              </button>
              {list.id !== "default" && (
                <button
                  onClick={() => deleteTaskList(list.id)}
                  className="hidden rounded p-1 text-muted hover:bg-surface2 hover:text-red-400 group-hover:block"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newListName.trim()) {
                addTaskList(newListName);
                setNewListName("");
              }
            }}
            placeholder="Nova lista..."
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
      </aside>

      {/* Kanban Board */}
      <main className="flex-1 flex flex-col overflow-hidden py-4 pr-4">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-light">{kanban.lists.find(l => l.id === activeListId)?.name || "Tarefas"}</h1>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-1">
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTaskTitle.trim()) {
                  addKanbanTask(newTaskTitle, activeListId, "todo");
                  setNewTaskTitle("");
                }
              }}
              placeholder="Adicionar tarefa rápida..."
              className="w-64 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-muted"
            />
            <button
              onClick={() => {
                if (newTaskTitle.trim()) {
                  addKanbanTask(newTaskTitle, activeListId, "todo");
                  setNewTaskTitle("");
                }
              }}
              className="grid place-items-center rounded bg-accent p-1.5 text-accent-fg hover:brightness-110"
            >
              <Plus size={16} />
            </button>
          </div>
        </header>

        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex h-full gap-4 overflow-x-auto pb-4">
            {columns.map((col) => {
              const colTasks = activeTasks.filter(t => t.status === col.id);
              return (
                <div key={col.id} className="flex w-80 shrink-0 flex-col gap-3 rounded-2xl bg-surface2/30 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-muted">
                    <span className={`h-2 w-2 rounded-full ${col.id === 'done' ? 'bg-green-500' : col.id === 'in_progress' ? 'bg-blue-500' : 'bg-zinc-500'}`} />
                    {col.title} <span className="ml-auto text-xs">{colTasks.length}</span>
                  </h3>
                  
                  <div id={col.id} className="flex-1 space-y-3 overflow-y-auto min-h-[100px]">
                    <SortableContext items={colTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      {colTasks.map((task) => (
                        <TaskCard key={task.id} task={task} onClick={() => setEditingTask(task)} />
                      ))}
                    </SortableContext>
                    
                    {colTasks.length === 0 && (
                      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-line/50 p-4 text-xs text-muted">
                        Solte tarefas aqui
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DndContext>
      </main>

      {/* Modal de Propriedades da Tarefa */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <header className="mb-6 flex items-center justify-between">
              <input
                value={editingTask.title}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                className="w-full bg-transparent text-2xl font-semibold outline-none"
                placeholder="Título da tarefa"
              />
              <button onClick={() => {
                updateKanbanTask(editingTask.id, editingTask);
                setEditingTask(null);
              }} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg">
                <X size={20} />
              </button>
            </header>

            <div className="space-y-6">
              {/* Propriedades (Notion Style) */}
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex w-24 items-center gap-2 text-muted"><Clock size={16} /> Status</div>
                  <select 
                    value={editingTask.status}
                    onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value as any })}
                    className="rounded bg-surface2 px-2 py-1 outline-none"
                  >
                    <option value="todo">A fazer</option>
                    <option value="in_progress">Fazendo</option>
                    <option value="done">Feito</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex w-24 items-center gap-2 text-muted"><Calendar size={16} /> Prazo</div>
                  <input 
                    type="date"
                    value={editingTask.dueDate || ""}
                    onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value || null })}
                    className="rounded bg-surface2 px-2 py-1 outline-none"
                  />
                </div>

                <div className="flex items-start gap-4 text-sm">
                  <div className="flex w-24 items-center gap-2 text-muted mt-1"><Tag size={16} /> Tags</div>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {editingTask.tags.map((tag, i) => (
                      <span key={i} className="flex items-center gap-1 rounded bg-accent/20 px-2 py-1 text-xs text-accent">
                        {tag}
                        <button onClick={() => {
                          setEditingTask({ ...editingTask, tags: editingTask.tags.filter((_, j) => i !== j) });
                        }}><X size={10} /></button>
                      </span>
                    ))}
                    <input 
                      placeholder="Nova tag..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          setEditingTask({ ...editingTask, tags: [...editingTask.tags, e.currentTarget.value.trim()] });
                          e.currentTarget.value = "";
                        }
                      }}
                      className="rounded bg-surface2 px-2 py-1 text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Subtarefas */}
              <div className="pt-4 border-t border-line">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
                  <CheckSquare size={16} /> Sub-tarefas
                </h3>
                <ul className="space-y-2 mb-3">
                  {editingTask.subtasks.map((st, i) => (
                    <li key={st.id} className="flex items-center gap-3">
                      <input 
                        type="checkbox"
                        checked={st.done}
                        onChange={(e) => {
                          const newSt = [...editingTask.subtasks];
                          newSt[i].done = e.target.checked;
                          setEditingTask({ ...editingTask, subtasks: newSt });
                        }}
                        className="accent-accent"
                      />
                      <input 
                        value={st.title}
                        onChange={(e) => {
                          const newSt = [...editingTask.subtasks];
                          newSt[i].title = e.target.value;
                          setEditingTask({ ...editingTask, subtasks: newSt });
                        }}
                        className={`flex-1 bg-transparent text-sm outline-none ${st.done ? 'text-muted line-through' : ''}`}
                      />
                      <button onClick={() => {
                        setEditingTask({ ...editingTask, subtasks: editingTask.subtasks.filter((_, j) => i !== j) });
                      }} className="text-muted hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                <input 
                  placeholder="Adicionar sub-tarefa..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.currentTarget.value.trim()) {
                      setEditingTask({ 
                        ...editingTask, 
                        subtasks: [...editingTask.subtasks, { id: Date.now().toString(), title: e.currentTarget.value.trim(), done: false }]
                      });
                      e.currentTarget.value = "";
                    }
                  }}
                  className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              <div className="pt-6 flex justify-between">
                <button 
                  onClick={() => {
                    deleteTask(editingTask.id);
                    setEditingTask(null);
                  }}
                  className="flex items-center gap-2 text-sm text-red-400 hover:brightness-110"
                >
                  <Trash2 size={16} /> Excluir tarefa
                </button>
                <button 
                  onClick={() => {
                    updateKanbanTask(editingTask.id, editingTask);
                    setEditingTask(null);
                  }}
                  className="rounded-lg bg-accent px-6 py-2 font-medium text-accent-fg hover:brightness-110"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
