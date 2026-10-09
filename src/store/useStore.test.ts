import { describe, it, expect, beforeEach } from "vitest";
import { useStore } from "./useStore";

describe("useStore", () => {
  beforeEach(() => {
    // Reset the store state before each test
    useStore.setState({
      mode: "timer",
      phase: "focus",
      status: "idle",
      plannedMs: 25 * 60 * 1000,
      sessions: [],
      notes: [],
      tasks: [],
      calendarEntries: [],
      subjects: ["Geral", "HTML", "CSS", "JavaScript"],
      subject: "Geral",
      userId: null,
      userEmail: null,
      settings: {
        soundEnabled: false,
        volume: 0.5,
        alarm: "bell",
        focusMin: 25,
        shortMin: 5,
        longMin: 15,
        autoSaveCalendar: false,
        notificationsEnabled: false,
        dailyGoalMin: 120,
      },
    });
  });

  it("should initialize with default state", () => {
    const state = useStore.getState();
    expect(state.mode).toBe("timer");
    expect(state.phase).toBe("focus");
    expect(state.status).toBe("idle");
    expect(state.subject).toBe("Geral");
  });

  it("should change mode and reset timer", () => {
    const { setMode } = useStore.getState();
    
    setMode("stopwatch");
    const state = useStore.getState();
    expect(state.mode).toBe("stopwatch");
    expect(state.status).toBe("idle");
  });

  it("should start the timer", () => {
    const { start } = useStore.getState();
    
    start();
    const state = useStore.getState();
    expect(state.status).toBe("running");
    expect(state.targetEnd).toBeGreaterThan(0);
  });

  it("should pause the timer", () => {
    const { start, pause } = useStore.getState();
    
    start();
    pause();
    
    const state = useStore.getState();
    expect(state.status).toBe("paused");
    expect(state.remainingMs).toBeDefined();
    expect(state.targetEnd).toBeNull();
  });

  it("should add a note with local user_id tracking", () => {
    const { addNote } = useStore.getState();
    
    addNote("Learn Vitest", "Geral");
    
    const state = useStore.getState();
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].content).toBe("Learn Vitest");
    expect(state.notes[0].synced).toBe(false);
    expect(state.notes[0].user_id).toBeUndefined(); // null userId = undefined
  });

  it("should add a note tracking the current user's ID", () => {
    useStore.setState({ userId: "user-123" });
    const { addNote } = useStore.getState();
    
    addNote("Private note", "Geral");
    
    const state = useStore.getState();
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0].user_id).toBe("user-123");
  });

  it("should add a new subject", () => {
    const { addSubject } = useStore.getState();
    
    addSubject("React");
    
    const state = useStore.getState();
    expect(state.subjects).toContain("React");
    expect(state.subject).toBe("React");
    expect(state.subjectManual).toBe(true);
  });

  it("should toggle a task", () => {
    const { addTask, toggleTask } = useStore.getState();
    
    addTask("Finish tests", "Geral");
    
    let state = useStore.getState();
    const taskId = state.tasks[0].id;
    expect(state.tasks[0].done).toBe(false);
    
    toggleTask(taskId);
    
    state = useStore.getState();
    expect(state.tasks[0].done).toBe(true);
    expect(state.tasks[0].synced).toBe(false); // Should be marked for sync
  });
});
