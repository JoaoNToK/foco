"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import SubjectPicker from "./SubjectPicker";

export default function NotesPanel() {
  const allNotes = useStore((s) => s.notes);
  const notes = allNotes.filter((n) => !n.deleted_at);
  const subject = useStore((s) => s.subject);
  const addNote = useStore((s) => s.addNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const [text, setText] = useState("");

  const save = () => {
    addNote(text, subject);
    setText("");
  };

  return (
    <section className="fade-up mx-auto w-full max-w-2xl" aria-label="Anotações">
      <h2 className="text-3xl font-light">Anotações</h2>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <textarea
          id="note-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && save()}
          placeholder="Escreva uma nota rápida…"
          rows={4}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <SubjectPicker compact />
          <button
            id="save-note-btn"
            onClick={save}
            disabled={!text.trim()}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-40"
          >
            Salvar nota
          </button>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {notes.length === 0 && <li className="text-sm text-muted">Nenhuma anotação ainda.</li>}
        {notes.map((n) => (
          <li key={n.id} className="group rounded-xl border border-line bg-surface p-4">
            <p className="whitespace-pre-wrap text-sm">{n.content}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>
                {n.subject && <span className="mr-2 rounded-full bg-accent/15 px-2 py-0.5 text-accent">{n.subject}</span>}
                {new Date(n.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {n.synced === false && " · pendente"}
              </span>
              <button
                onClick={() => deleteNote(n.id)}
                aria-label="Excluir nota"
                className="opacity-0 transition hover:text-fg group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
