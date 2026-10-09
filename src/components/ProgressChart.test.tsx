import { describe, it, expect } from "vitest";
import { aggregate } from "./ProgressChart";
import type { Session } from "@/lib/types";

describe("ProgressChart aggregate function", () => {
  it("should aggregate empty sessions correctly", () => {
    const today = new Date("2024-01-10T12:00:00Z"); // Wed
    const result = aggregate([], 0, today);
    
    expect(result.todayMin).toBe(0);
    expect(result.totalWeekMin).toBe(0);
    expect(result.chart.every((d) => d.min === 0)).toBe(true);
    expect(result.subjects).toHaveLength(0);
  });

  it("should aggregate sessions within the current week", () => {
    // Wed, 10 Jan 2024 12:00 UTC
    const today = new Date("2024-01-10T12:00:00Z"); 
    
    const sessions: Session[] = [
      {
        id: "1",
        subject: "Math",
        started_at: "2024-01-10T10:00:00Z", // Today
        duration_sec: 1800, // 30 min
        synced: true,
      },
      {
        id: "2",
        subject: "Physics",
        started_at: "2024-01-08T10:00:00Z", // Mon
        duration_sec: 1200, // 20 min
        synced: true,
      },
    ];

    const result = aggregate(sessions, 0, today);
    
    expect(result.todayMin).toBe(30);
    expect(result.totalWeekMin).toBe(50);
    
    // Check subject aggregation
    expect(result.subjects).toHaveLength(2);
    expect(result.subjects.find((s) => s.name === "Math")?.min).toBe(30);
    expect(result.subjects.find((s) => s.name === "Physics")?.min).toBe(20);
    
    // Check daily distribution (0=Sun, 1=Mon, 2=Tue, 3=Wed, ...)
    expect(result.chart[1].min).toBe(20); // Mon
    expect(result.chart[3].min).toBe(30); // Wed
  });

  it("should calculate correctly for negative week offsets", () => {
    const today = new Date("2024-01-10T12:00:00Z"); // Wed
    
    const sessions: Session[] = [
      {
        id: "1",
        subject: "Math",
        started_at: "2024-01-03T10:00:00Z", // Last Wed
        duration_sec: 3600, // 60 min
        synced: true,
      },
      {
        id: "2",
        subject: "Math",
        started_at: "2024-01-10T10:00:00Z", // Today (Should NOT be in last week's sum)
        duration_sec: 1800, // 30 min
        synced: true,
      },
    ];

    // weekOffset = -1 (Last week)
    const result = aggregate(sessions, -1, today);
    
    // todayMin should always reflect actual today, regardless of offset
    expect(result.todayMin).toBe(30);
    
    // totalWeekMin should only include last week's sessions
    expect(result.totalWeekMin).toBe(60);
    
    // Subjects list only includes last week's
    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0].min).toBe(60);
  });
});
