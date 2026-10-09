import { describe, it, expect, beforeEach } from "vitest";
import { useStore, DEFAULT_SETTINGS } from "@/store/useStore";
import { sortByOrder, placeInColumn, toFull } from "@/lib/kanban";

const reset = () =>
  useStore.setState({
    tasks: [],
    userId: null,
    settings: { ...DEFAULT_SETTINGS, kanban: { lists: [{ id: "default", name: "Geral" }], taskExtras: {} } },
  });

const colTitles = (status: "todo" | "in_progress" | "done", listId = "default") => {
  const s = useStore.getState();
  const kb = s.settings.kanban!;
  return sortByOrder(s.tasks.filter((t) => !t.deleted_at).map((t) => toFull(t, kb)))
    .filter((t) => t.status === status && t.listId === listId)
    .map((t) => t.title);
};
const idOf = (title: string) => useStore.getState().tasks.find((t) => t.title === title)!.id;

describe("placeInColumn (feature: reordenar)", () => {
  it("move dentro da mesma coluna (arrayMove)", () => {
    expect(placeInColumn(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(placeInColumn(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
  it("entra antes do alvo em outra coluna", () => {
    expect(placeInColumn(["x", "y"], "m", "y")).toEqual(["x", "m", "y"]);
  });
  it("sem alvo vai para o fim", () => {
    expect(placeInColumn(["x", "y"], "m", null)).toEqual(["x", "y", "m"]);
  });
  it("soltar em si mesmo não muda nada", () => {
    expect(placeInColumn(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
});

describe("sortByOrder", () => {
  it("tarefas antigas (sem order) vêm primeiro por data", () => {
    const r = sortByOrder([
      { id: "n", order: 0, created_at: "2026-01-03" },
      { id: "o2", created_at: "2026-01-02" },
      { id: "o1", created_at: "2026-01-01" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["o1", "o2", "n"]);
  });
});

describe("Kanban store: reordenar", () => {
  beforeEach(reset);

  it("novas tarefas entram no fim da coluna", () => {
    const { addKanbanTask } = useStore.getState();
    addKanbanTask("A", "default");
    addKanbanTask("B", "default");
    addKanbanTask("C", "default");
    expect(colTitles("todo")).toEqual(["A", "B", "C"]);
  });

  it("reordena na mesma coluna e persiste", () => {
    const { addKanbanTask, moveKanbanTask } = useStore.getState();
    addKanbanTask("A", "default");
    addKanbanTask("B", "default");
    addKanbanTask("C", "default");
    moveKanbanTask(idOf("C"), "todo", idOf("A"));
    expect(colTitles("todo")).toEqual(["C", "A", "B"]);
    moveKanbanTask(idOf("C"), "todo", idOf("B"));
    expect(colTitles("todo")).toEqual(["A", "B", "C"]);
  });

  it("move entre colunas na posição certa e marca done", () => {
    const { addKanbanTask, moveKanbanTask } = useStore.getState();
    addKanbanTask("A", "default");
    addKanbanTask("B", "default");
    addKanbanTask("X", "default", "done");
    moveKanbanTask(idOf("A"), "done", idOf("X"));
    expect(colTitles("done")).toEqual(["A", "X"]);
    expect(colTitles("todo")).toEqual(["B"]);
    expect(useStore.getState().tasks.find((t) => t.title === "A")!.done).toBe(true);
    moveKanbanTask(idOf("A"), "in_progress", null);
    expect(useStore.getState().tasks.find((t) => t.title === "A")!.done).toBe(false);
  });

  it("não afeta outras listas", () => {
    const { addKanbanTask, addTaskList, moveKanbanTask } = useStore.getState();
    addTaskList("Outra");
    const other = useStore.getState().settings.kanban!.lists[1].id;
    addKanbanTask("A", "default");
    addKanbanTask("B", other);
    moveKanbanTask(idOf("A"), "in_progress", null);
    expect(colTitles("todo", other)).toEqual(["B"]);
  });

  it("excluir lista apaga as tarefas dela", () => {
    const { addKanbanTask, addTaskList, deleteTaskList } = useStore.getState();
    addTaskList("Outra");
    const other = useStore.getState().settings.kanban!.lists[1].id;
    addKanbanTask("B", other);
    addKanbanTask("A", "default");
    deleteTaskList(other);
    expect(useStore.getState().tasks.filter((t) => !t.deleted_at).map((t) => t.title)).toEqual(["A"]);
  });
});
