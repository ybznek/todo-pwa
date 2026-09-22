import { describe, expect, it } from "vitest";
import { createSubtask, createTask } from "../models/task";
import { emptyDocument, parseMarkdown, serializeMarkdown } from "./markdown";

describe("markdown database", () => {
  it("round-trips active tasks", () => {
    const task = createTask("Napsat report");
    task.timeMs = 125_000;
    task.pomodoros = 2;

    const data = emptyDocument([task]);
    data.activeTaskId = task.id;

    const parsed = parseMarkdown(serializeMarkdown(data));

    expect(parsed.activeTaskId).toBe(task.id);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0]).toMatchObject({
      title: "Napsat report",
      timeMs: 125_000,
      pomodoros: 2,
    });
  });

  it("round-trips subtasks and notes", () => {
    const task = createTask("Nákup");
    const sub1 = createSubtask("Mléko");
    sub1.done = true;
    task.subtasks = [sub1, createSubtask("Chleba")];
    task.notes = "Preferovat bio\nVezít tašku";

    const parsed = parseMarkdown(serializeMarkdown(emptyDocument([task]))).tasks[0];

    expect(parsed.subtasks).toHaveLength(2);
    expect(parsed.subtasks[0]).toMatchObject({ title: "Mléko", done: true });
    expect(parsed.subtasks[1]).toMatchObject({ title: "Chleba", done: false });
    expect(parsed.notes).toBe("Preferovat bio\nVezít tašku");
  });

  it("keeps deleted tasks as comments", () => {
    const task = createTask("Starý úkol");
    task.subtasks = [createSubtask("Podúkol")];
    task.notes = "poznámka";

    const markdown = serializeMarkdown({
      activeTaskId: null,
      tasks: [],
      deleted: [{ ...task, deletedAt: "2026-09-22T09:00:00.000Z" }],
    });

    expect(markdown).toContain("<!-- smazáno:");
    const parsed = parseMarkdown(markdown).deleted[0];
    expect(parsed.title).toBe("Starý úkol");
    expect(parsed.subtasks).toHaveLength(1);
    expect(parsed.notes).toBe("poznámka");
  });
});
