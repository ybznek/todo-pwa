import type { Task } from "../models/task";

export interface TodoDocument {
  activeTaskId: string | null;
  tasks: Task[];
  deleted: Task[];
}

const TASK_LINE =
  /^- \[([ xX])\] (.+?) <!-- id:([^\s]+) time:(\d+) pomodoros:(\d+) created:([^\s]+) -->$/;

const DELETED_LINE =
  /^<!-- smazáno: - \[([ xX])\] (.+?) id:([^\s]+) time:(\d+) pomodoros:(\d+) created:([^\s]+) deleted:([^\s]+) -->$/;

export function parseMarkdown(content: string): TodoDocument {
  const lines = content.split(/\r?\n/);
  let activeTaskId: string | null = null;
  const tasks: Task[] = [];
  const deleted: Task[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const activeMatch = line.match(/^active:\s*(.+)$/);
    if (activeMatch) {
      activeTaskId = activeMatch[1].trim() || null;
      continue;
    }

    const taskMatch = line.match(TASK_LINE);
    if (taskMatch) {
      tasks.push({
        done: taskMatch[1].toLowerCase() === "x",
        title: taskMatch[2],
        id: taskMatch[3],
        timeMs: Number(taskMatch[4]),
        pomodoros: Number(taskMatch[5]),
        created: taskMatch[6],
      });
      continue;
    }

    const deletedMatch = line.match(DELETED_LINE);
    if (deletedMatch) {
      deleted.push({
        done: deletedMatch[1].toLowerCase() === "x",
        title: deletedMatch[2],
        id: deletedMatch[3],
        timeMs: Number(deletedMatch[4]),
        pomodoros: Number(deletedMatch[5]),
        created: deletedMatch[6],
        deletedAt: deletedMatch[7],
      });
    }
  }

  return { activeTaskId, tasks, deleted };
}

export function serializeMarkdown(data: TodoDocument): string {
  const lines = [
    "---",
    `active: ${data.activeTaskId ?? ""}`,
    "---",
    "",
    "# Todo PWA",
    "",
    "Úkoly se ukládají jako markdown. Smazané položky zůstávají zakomentované.",
    "",
    "## Úkoly",
    "",
  ];

  for (const task of data.tasks) {
    const check = task.done ? "x" : " ";
    lines.push(
      `- [${check}] ${task.title} <!-- id:${task.id} time:${task.timeMs} pomodoros:${task.pomodoros} created:${task.created} -->`,
    );
  }

  if (data.deleted.length) {
    lines.push("", "## Smazané (komentáře)", "");
    for (const task of data.deleted) {
      const check = task.done ? "x" : " ";
      lines.push(
        `<!-- smazáno: - [${check}] ${task.title} id:${task.id} time:${task.timeMs} pomodoros:${task.pomodoros} created:${task.created} deleted:${task.deletedAt ?? new Date().toISOString()} -->`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function emptyDocument(tasks: Task[] = []): TodoDocument {
  return {
    activeTaskId: tasks[0]?.id ?? null,
    tasks,
    deleted: [],
  };
}
