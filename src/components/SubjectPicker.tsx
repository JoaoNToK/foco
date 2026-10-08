"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useStore } from "@/store/useStore";

export default function SubjectPicker({ compact = false }: { compact?: boolean }) {
  const subject = useStore((s) => s.subject);
  const subjects = useStore((s) => s.subjects);
  const setSubject = useStore((s) => s.setSubject);
  const addSubject = useStore((s) => s.addSubject);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = () => {
    addSubject(draft);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <select
        id="subject-select"
        aria-label="Matéria"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg outline-none transition focus:border-accent ${
          compact ? "max-w-[10rem]" : ""
        }`}
      >
        {subjects.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {adding ? (
        <input
          id="new-subject-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={submit}
          placeholder="Nova matéria"
          className="w-32 rounded-lg border border-accent bg-surface px-3 py-1.5 text-sm outline-none"
        />
      ) : (
        <button
          id="add-subject-btn"
          onClick={() => setAdding(true)}
          aria-label="Adicionar matéria"
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition hover:border-accent hover:text-accent"
        >
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}
