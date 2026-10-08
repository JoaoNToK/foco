"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import SubjectPicker from "./SubjectPicker";

export default function TasksPanel() {
  const tasks = useStore((s) => s.tasks);
  const subject = useStore((s) => s.subject);
  const addTask = useStore((s) => s.addTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const [title, setTitle] = useState("");

  const submit = () => {
    addTask(title, subject);
    setTitle("");
  };

  return (
    <section className="fade-up mx-auto w-full max-w-2xl" aria-label="Lembretes">
      <h2 className="text-3xl font-light">Lembretes</h2>
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
        <input
          id="task-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Novo lembrete…"
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted"
        />
        <SubjectPicker compact />
        <button
          id="add-task-btn"
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-40"
        >
          Adicionar
        </button>
      </div>

      <ul className="mt-6 space-y-2">
        {tasks.length === 0 && <li className="text-sm text-muted">Nada pendente. 🎉</li>}
        {tasks.map((t) => (
          <li key={t.id} className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <button
              onClick={() => toggleTask(t.id)}
              role="checkbox"
              aria-checked={t.done}
              aria-label={`Marcar "${t.title}"`}
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                t.done ? "border-accent bg-accent text-accent-fg" : "border-line hover:border-accent"
              }`}
            >
              {t.done && <Check size={13} strokeWidth={3} />}
            </button>
            <span className={`flex-1 text-sm ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
            {t.subject && <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs text-muted">{t.subject}</span>}
            <button
              onClick={() => deleteTask(t.id)}
              aria-label="Excluir lembrete"
              className="text-muted opacity-0 transition hover:text-fg group-hover:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
