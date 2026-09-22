import { describe, expect, it } from "vitest";
import { createTask } from "../models/task";
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

  it("keeps deleted tasks as comments", () => {
    const task = createTask("Starý úkol");
    const markdown = serializeMarkdown({
      activeTaskId: null,
      tasks: [],
      deleted: [{ ...task, deletedAt: "2026-09-22T09:00:00.000Z" }],
    });

    expect(markdown).toContain("<!-- smazáno:");
    expect(parseMarkdown(markdown).deleted).toHaveLength(1);
  });
});
