import { describe, it, expect, beforeEach } from "vitest";
import { useStore, DEFAULT_SETTINGS } from "@/store/useStore";
import { allTags, tagColorIndex, tagClass, TAG_PALETTE, toFull, sortByOrder } from "@/lib/kanban";

const reset = () =>
  useStore.setState({
    tasks: [],
    userId: null,
    settings: { ...DEFAULT_SETTINGS, kanban: { lists: [{ id: "default", name: "Geral" }], taskExtras: {} } },
  });
const st = () => useStore.getState();
const kb = () => st().settings.kanban!;
const idOf = (title: string) => st().tasks.find((t) => t.title === title)!.id;
const full = (title: string) => toFull(st().tasks.find((t) => t.title === title)!, kb());
void sortByOrder;

describe("Feature 2: cores e reaproveitamento de tags", () => {
  beforeEach(reset);

  it("cor padrão é estável para a mesma tag e está dentro da paleta", () => {
    const a = tagColorIndex("Estudos");
    expect(a).toBe(tagColorIndex("Estudos"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(TAG_PALETTE.length);
  });

  it("cor escolhida pelo usuário tem prioridade e persiste no store", () => {
    st().setTagColor("Estudos", 5);
    expect(kb().tagColors).toEqual({ Estudos: 5 });
    expect(tagColorIndex("Estudos", kb().tagColors)).toBe(5);
    expect(tagClass("Estudos", kb().tagColors)).toBe(TAG_PALETTE[5]);
  });

  it("índice inválido cai para a cor padrão", () => {
    expect(tagColorIndex("X", { X: 99 })).toBe(tagColorIndex("X"));
  });

  it("alterar a cor de uma tag vale para todas as tarefas", () => {
    st().addKanbanTask("A", "default");
    st().addKanbanTask("B", "default");
    st().updateKanbanTask(idOf("A"), { tags: ["Pessoal"] });
    st().updateKanbanTask(idOf("B"), { tags: ["Pessoal"] });
    st().setTagColor("Pessoal", 2);
    expect(tagColorIndex("Pessoal", kb().tagColors)).toBe(2);
  });

  it("allTags lista tags únicas ordenadas, ignorando tarefas excluídas", () => {
    st().addKanbanTask("A", "default");
    st().addKanbanTask("B", "default");
    st().addKanbanTask("C", "default");
    st().updateKanbanTask(idOf("A"), { tags: ["Zeta", "Alfa"] });
    st().updateKanbanTask(idOf("B"), { tags: ["Alfa", "Beta"] });
    st().updateKanbanTask(idOf("C"), { tags: ["Fantasma"] });
    st().deleteTask(idOf("C"));
    expect(allTags(st().tasks, kb())).toEqual(["Alfa", "Beta", "Zeta"]);
  });

  it("tags da tarefa persistem após várias adições (bug anterior)", () => {
    st().addKanbanTask("A", "default");
    const id = idOf("A");
    st().updateKanbanTask(id, { tags: ["t1"] });
    st().updateKanbanTask(id, { tags: [...full("A").tags, "t2"] });
    st().updateKanbanTask(id, { tags: [...full("A").tags, "t3"] });
    expect(full("A").tags).toEqual(["t1", "t2", "t3"]);
  });
});

import { PRIORITIES, priorityOf } from "@/lib/kanban";

describe("Feature 3: prioridade", () => {
  beforeEach(reset);

  it("tarefa nova não tem prioridade (none)", () => {
    st().addKanbanTask("A", "default");
    expect(priorityOf(full("A").priority).id).toBe("none");
  });

  it("define e persiste cada nível de prioridade", () => {
    st().addKanbanTask("A", "default");
    for (const p of PRIORITIES) {
      st().updateKanbanTask(idOf("A"), { priority: p.id });
      expect(full("A").priority).toBe(p.id);
    }
  });

  it("mudar prioridade não altera outros campos", () => {
    st().addKanbanTask("A", "default");
    st().updateKanbanTask(idOf("A"), { tags: ["x"], dueDate: "2026-10-10" });
    st().updateKanbanTask(idOf("A"), { priority: "high" });
    const f = full("A");
    expect(f.tags).toEqual(["x"]);
    expect(f.dueDate).toBe("2026-10-10");
    expect(f.priority).toBe("high");
  });

  it("priorityOf com valor desconhecido/ausente cai em none", () => {
    expect(priorityOf(undefined).id).toBe("none");
    expect(priorityOf("xyz" as never).id).toBe("none");
  });

  it("ranks crescem de none a high", () => {
    const ranks = PRIORITIES.map((p) => p.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe("Feature 4: descrição", () => {
  beforeEach(reset);

  it("tarefa nova não tem descrição", () => {
    st().addKanbanTask("A", "default");
    expect(full("A").description).toBeUndefined();
  });

  it("define e persiste descrição", () => {
    st().addKanbanTask("A", "default");
    st().updateKanbanTask(idOf("A"), { description: "Uma descrição detalhada" });
    expect(full("A").description).toBe("Uma descrição detalhada");
  });

  it("mudar descrição não altera outros campos", () => {
    st().addKanbanTask("A", "default");
    st().updateKanbanTask(idOf("A"), { tags: ["x"], priority: "high" });
    st().updateKanbanTask(idOf("A"), { description: "Teste" });
    const f = full("A");
    expect(f.tags).toEqual(["x"]);
    expect(f.priority).toBe("high");
    expect(f.description).toBe("Teste");
  });

  it("consegue apagar a descrição", () => {
    st().addKanbanTask("A", "default");
    st().updateKanbanTask(idOf("A"), { description: "Teste" });
    st().updateKanbanTask(idOf("A"), { description: "" });
    expect(full("A").description).toBe("");
  });
});

describe("Feature 5: recorrência", () => {
  beforeEach(reset);

  it("tarefa nova não tem recorrência", () => {
    st().addKanbanTask("A", "default");
    expect(full("A").recurrence).toBeUndefined();
  });

  it("define e persiste recorrência", () => {
    st().addKanbanTask("A", "default");
    st().updateKanbanTask(idOf("A"), { recurrence: "daily" });
    expect(full("A").recurrence).toBe("daily");
  });

  it("gera nova tarefa ao concluir tarefa recorrente via updateKanbanTask", () => {
    st().addKanbanTask("A", "default");
    const id = idOf("A");
    st().updateKanbanTask(id, { recurrence: "daily", dueDate: "2026-10-10", tags: ["t1"], priority: "high" });
    
    // Conclui a tarefa
    st().updateKanbanTask(id, { status: "done" });
    
    // A tarefa original deve estar concluída
    expect(toFull(st().tasks.find(t => t.id === id)!, kb()).status).toBe("done");
    expect(st().tasks.find(t => t.id === id)!.done).toBe(true);

    // Uma nova tarefa deve ter sido criada na coluna "todo" com a data atualizada
    const tasks = st().tasks.filter(t => t.title === "A");
    expect(tasks.length).toBe(2);
    
    const newTask = tasks.find(t => t.id !== id)!;
    expect(newTask.done).toBe(false);
    
    const newFull = toFull(newTask, kb());
    expect(newFull.status).toBe("todo");
    expect(newFull.dueDate).toBe("2026-10-11"); // 1 dia depois
    expect(newFull.tags).toEqual(["t1"]);
    expect(newFull.priority).toBe("high");
    expect(newFull.recurrence).toBe("daily");
  });

  it("gera nova tarefa ao concluir tarefa recorrente via moveKanbanTask", () => {
    st().addKanbanTask("B", "default");
    const id = idOf("B");
    st().updateKanbanTask(id, { recurrence: "weekly", dueDate: "2026-10-10" });
    
    st().moveKanbanTask(id, "done", null);
    
    const tasks = st().tasks.filter(t => t.title === "B");
    expect(tasks.length).toBe(2);
    
    const newTask = tasks.find(t => t.id !== id)!;
    const newFull = toFull(newTask, kb());
    expect(newFull.dueDate).toBe("2026-10-17"); // 7 dias depois
  });

  it("não gera nova tarefa se não tinha dueDate e concluiu recorrente", () => {
    st().addKanbanTask("C", "default");
    const id = idOf("C");
    st().updateKanbanTask(id, { recurrence: "monthly" });
    
    st().updateKanbanTask(id, { status: "done" });
    
    const tasks = st().tasks.filter(t => t.title === "C");
    expect(tasks.length).toBe(2);
    
    const newTask = tasks.find(t => t.id !== id)!;
    const newFull = toFull(newTask, kb());
    expect(newFull.dueDate).toBeNull(); // manteve null
  });

  it("subtarefas da nova tarefa vêm desmarcadas", () => {
    st().addKanbanTask("D", "default");
    const id = idOf("D");
    st().updateKanbanTask(id, { 
      recurrence: "daily",
      subtasks: [
        { id: "s1", title: "Sub 1", done: true },
        { id: "s2", title: "Sub 2", done: false }
      ]
    });
    
    st().updateKanbanTask(id, { status: "done" });
    
    const newTask = st().tasks.find(t => t.title === "D" && t.id !== id)!;
    const newFull = toFull(newTask, kb());
    expect(newFull.subtasks).toEqual([
      { id: "s1", title: "Sub 1", done: false },
      { id: "s2", title: "Sub 2", done: false }
    ]);
  });
});

describe("Feature 6: arquivar concluídas", () => {
  beforeEach(reset);

  it("tarefa nova não está arquivada", () => {
    st().addKanbanTask("A", "default");
    expect(full("A").archived).toBeFalsy();
  });

  it("permite arquivar tarefa via updateKanbanTask", () => {
    st().addKanbanTask("A", "default");
    st().updateKanbanTask(idOf("A"), { archived: true });
    expect(full("A").archived).toBe(true);
  });

  it("archiveKanbanTasks arquiva apenas as tarefas 'done' e 'não arquivadas' da lista atual", () => {
    st().addTaskList("lista2");
    
    st().addKanbanTask("T1", "default", "todo");
    st().addKanbanTask("T2", "default", "done"); // deve arquivar
    st().addKanbanTask("T3", "default", "done"); // deve arquivar
    
    st().addKanbanTask("T4", "lista2", "done");  // não deve arquivar (outra lista)
    
    const t3 = idOf("T3");
    st().updateKanbanTask(t3, { archived: true }); // já está arquivado
    
    st().archiveKanbanTasks("default");
    
    expect(full("T1").archived).toBeFalsy();
    expect(full("T2").archived).toBe(true);
    expect(full("T3").archived).toBe(true);
    
    // Lista 2 intacta
    const t4Full = toFull(st().tasks.find(t => t.title === "T4")!, kb());
    expect(t4Full.archived).toBeFalsy();
  });
});
