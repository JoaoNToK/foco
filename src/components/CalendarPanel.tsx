"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, FileText, Flag, X, Tag } from "lucide-react";
import { useStore } from "@/store/useStore";
import { toast } from "sonner";

const DAYS_OF_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const COLOR_CLASSES: Record<string, string> = {
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  pink: "bg-pink-500",
  default: "bg-muted"
};

const TEXT_CLASSES: Record<string, string> = {
  blue: "text-blue-500",
  purple: "text-purple-500",
  red: "text-red-500",
  green: "text-green-500",
  yellow: "text-yellow-500",
  pink: "text-pink-500",
  default: "text-muted"
};

const TAG_ICONS: Record<string, React.ReactNode> = {
  event: <Calendar size={14} />,
  assignment: <FileText size={14} />,
  deadline: <Flag size={14} />
};

export default function CalendarPanel() {
  const { calendarEntries, calendarTags, addCalendarEntry, deleteCalendarEntry, addCalendarTag } = useStore();
  
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // "YYYY-MM-DD"
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<string>(calendarTags[0]?.id || "event");

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState("green");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = toDateStr(new Date());

  const daysArray = (() => {
    const arr: { day: number; dateStr: string }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      arr.push({ day: i, dateStr: toDateStr(new Date(year, month, i)) });
    }
    return arr;
  })();

  const entriesMap = (() => {
    const map = new Map<string, typeof calendarEntries>();
    calendarEntries.forEach(entry => {
      const list = map.get(entry.date) || [];
      list.push(entry);
      map.set(entry.date, list);
    });
    return map;
  })();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedDate) return;
    addCalendarEntry(newTitle, newType, selectedDate);
    setNewTitle("");
    setShowAddForm(false);
    toast.success("Adicionado com sucesso");
  };

  const selectedEntries = selectedDate ? entriesMap.get(selectedDate) || [] : [];
  const getTag = (id: string) => calendarTags.find((t) => t.id === id) || { id, label: id, color: "default" };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-8 sm:flex-row">
      
      {/* Calendar Grid */}
      <div className="flex w-full max-w-[320px] flex-col gap-4 mx-auto sm:mx-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="grid h-8 w-8 place-items-center rounded-lg bg-surface transition hover:bg-surface2"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={handleNextMonth}
              className="grid h-8 w-8 place-items-center rounded-lg bg-surface transition hover:bg-surface2"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {DAYS_OF_WEEK.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted py-2">
              {d}
            </div>
          ))}

          {/* Empty cells for first day offset */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-10 w-10" />
          ))}

          {/* Days */}
          {daysArray.map(({ day, dateStr }) => {
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const dayEntries = entriesMap.get(dateStr) || [];
            
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm transition hover:bg-surface2
                  ${isSelected ? "bg-fg text-bg hover:bg-fg/90" : ""}
                `}
              >
                <span className={`${isToday && !isSelected ? "text-accent font-semibold" : ""}`}>
                  {day}
                </span>
                
                {/* Dots indicator */}
                {dayEntries.length > 0 && (
                  <div className="absolute bottom-1.5 flex gap-0.5">
                    {dayEntries.slice(0, 3).map((e, idx) => {
                      const t = getTag(e.type);
                      return <div key={idx} className={`h-1 w-1 rounded-full ${COLOR_CLASSES[t.color] || COLOR_CLASSES.default}`} />;
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side Panel for Selected Date */}
      <div className="flex h-fit w-full flex-col rounded-2xl border border-line bg-surface p-4 sm:w-80">
        {selectedDate ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium">
                {formatDateBr(selectedDate)}
              </h3>
              {!showAddForm && (
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setNewType(calendarTags[0]?.id || "event");
                  }}
                  className="flex items-center gap-1 rounded-lg bg-accent/10 px-2 py-1 text-sm font-medium text-accent hover:bg-accent/20"
                >
                  <Plus size={16} />
                  Adicionar
                </button>
              )}
            </div>

            {showAddForm && (
              <form onSubmit={handleAdd} className="mb-4 flex flex-col gap-3 rounded-xl border border-line p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Novo</span>
                  <button type="button" onClick={() => setShowAddForm(false)} className="text-muted hover:text-fg">
                    <X size={16} />
                  </button>
                </div>
                
                <input
                  type="text"
                  placeholder="Título (ex: Prova de Matemática)"
                  className="w-full rounded-lg bg-bg px-3 py-2 text-sm outline-none border border-line focus:border-accent"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                />
                
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted">Categoria</span>
                  <div className="flex flex-wrap gap-2">
                    {calendarTags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setNewType(t.id)}
                        className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition ${
                          newType === t.id ? "bg-fg text-bg" : "bg-bg text-muted border border-line hover:text-fg"
                        }`}
                      >
                        <span className={newType === t.id ? "text-bg" : (TEXT_CLASSES[t.color] || TEXT_CLASSES.default)}>
                          {TAG_ICONS[t.id] || <Tag size={14} />}
                        </span>
                        {t.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsAddingTag(!isAddingTag)}
                      className="flex items-center justify-center rounded-lg border border-line bg-bg px-2 py-1.5 text-muted hover:text-fg"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {isAddingTag && (
                    <div className="flex items-center gap-2 rounded-lg bg-surface2 p-2 mt-1 fade-up">
                      <input
                        type="text"
                        placeholder="Nome da tag..."
                        className="w-full min-w-0 flex-1 rounded bg-bg px-2 py-1.5 text-xs outline-none border border-line"
                        value={newTagLabel}
                        onChange={(e) => setNewTagLabel(e.target.value)}
                        autoFocus
                      />
                      <select
                        className="rounded bg-bg px-1 py-1.5 text-xs outline-none border border-line"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                      >
                        {Object.keys(COLOR_CLASSES).filter(k => k !== 'default').map(k => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (newTagLabel.trim()) {
                            addCalendarTag(newTagLabel, newTagColor);
                            setIsAddingTag(false);
                            setNewTagLabel("");
                          }
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded bg-accent text-white"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
                >
                  Salvar
                </button>
              </form>
            )}

            <div className="flex flex-col gap-2">
              {selectedEntries.length === 0 && !showAddForm ? (
                <p className="text-center text-sm text-muted py-6">Nenhum evento neste dia.</p>
              ) : (
                selectedEntries.map((entry) => {
                  const tag = getTag(entry.type);
                  return (
                    <div key={entry.id} className="flex items-center justify-between rounded-xl border border-line bg-bg p-3">
                      <div className="flex items-center gap-3">
                        <div className={`grid h-8 w-8 place-items-center rounded-lg bg-surface ${TEXT_CLASSES[tag.color] || TEXT_CLASSES.default}`}>
                          {TAG_ICONS[tag.id] || <Tag size={14} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{entry.title}</span>
                          <span className="text-xs text-muted">{tag.label}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteCalendarEntry(entry.id)}
                        className="text-muted hover:text-red-500 transition"
                        aria-label="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center text-center text-muted">
            <Calendar size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Selecione um dia no calendário<br/>para ver ou adicionar itens.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Helpers
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function toDateStr(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function formatDateBr(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "long"
  });
}
