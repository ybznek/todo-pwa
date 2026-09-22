import type { Subtask, Task } from "../models/task";

export interface TodoDocument {
  activeTaskId: string | null;
  tasks: Task[];
  deleted: Task[];
}

const TASK_LINE =
  /^- \[([ xX])\] (.+?) <!-- id:([^\s]+) time:(\d+) pomodoros:(\d+) created:([^\s]+) -->$/;

const SUBTASK_LINE = /^  - \[([ xX])\] (.+?) <!-- id:([^\s]+) -->$/;

const NOTE_LINE = /^  > ?(.*)$/;

const DELETED_SINGLE =
  /^<!-- smazáno: - \[([ xX])\] (.+?) id:([^\s]+) time:(\d+) pomodoros:(\d+) created:([^\s]+) deleted:([^\s]+) -->$/;

const DELETED_BLOCK_START = /^<!-- smazáno:?$/;

function parseTaskMeta(
  match: RegExpMatchArray,
  subtasks: Subtask[] = [],
  notes = "",
): Task {
  return {
    done: match[1].toLowerCase() === "x",
    title: match[2],
    id: match[3],
    timeMs: Number(match[4]),
    pomodoros: Number(match[5]),
    created: match[6],
    subtasks,
    notes,
  };
}

function appendNote(notes: string, line: string): string {
  return notes ? `${notes}\n${line}` : line;
}

function serializeTaskBody(task: Task, indent: string): string[] {
  const lines: string[] = [];
  const check = task.done ? "x" : " ";
  lines.push(
    `${indent}- [${check}] ${task.title} <!-- id:${task.id} time:${task.timeMs} pomodoros:${task.pomodoros} created:${task.created} -->`,
  );

  for (const subtask of task.subtasks) {
    const subCheck = subtask.done ? "x" : " ";
    lines.push(`${indent}  - [${subCheck}] ${subtask.title} <!-- id:${subtask.id} -->`);
  }

  if (task.notes.trim()) {
    for (const noteLine of task.notes.split("\n")) {
      lines.push(`${indent}  > ${noteLine}`);
    }
  }

  return lines;
}

function parseTaskBlock(lines: string[], startIndex: number): { task: Task; nextIndex: number } {
  const taskMatch = lines[startIndex].match(TASK_LINE);
  if (!taskMatch) {
    throw new Error(`Invalid task line: ${lines[startIndex]}`);
  }

  const subtasks: Subtask[] = [];
  let notes = "";
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index];

    if (TASK_LINE.test(line) || DELETED_BLOCK_START.test(line.trim()) || DELETED_SINGLE.test(line.trim())) {
      break;
    }

    if (line.trim() === "" || line.startsWith("## ") || line === "---") {
      index += 1;
      continue;
    }

    const subMatch = line.match(SUBTASK_LINE);
    if (subMatch) {
      subtasks.push({
        done: subMatch[1].toLowerCase() === "x",
        title: subMatch[2],
        id: subMatch[3],
      });
      index += 1;
      continue;
    }

    const noteMatch = line.match(NOTE_LINE);
    if (noteMatch) {
      notes = appendNote(notes, noteMatch[1]);
      index += 1;
      continue;
    }

    break;
  }

  return { task: parseTaskMeta(taskMatch, subtasks, notes), nextIndex: index };
}

function parseDeletedBlock(lines: string[], startIndex: number): { task: Task; nextIndex: number } {
  let index = startIndex + 1;
  let deletedAt = new Date().toISOString();

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed === "-->") {
      index += 1;
      break;
    }

    const deletedAtMatch = trimmed.match(/^deleted:(.+)$/);
    if (deletedAtMatch) {
      deletedAt = deletedAtMatch[1];
      index += 1;
      continue;
    }

    if (TASK_LINE.test(lines[index])) {
      const parsed = parseTaskBlock(lines, index);
      parsed.task.deletedAt = deletedAt;
      return { task: parsed.task, nextIndex: index + 1 };
    }

    index += 1;
  }

  throw new Error("Invalid deleted task block");
}

export function parseMarkdown(content: string): TodoDocument {
  const lines = content.split(/\r?\n/);
  let activeTaskId: string | null = null;
  const tasks: Task[] = [];
  const deleted: Task[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line) {
      index += 1;
      continue;
    }

    const activeMatch = line.match(/^active:\s*(.+)$/);
    if (activeMatch) {
      activeTaskId = activeMatch[1].trim() || null;
      index += 1;
      continue;
    }

    if (DELETED_BLOCK_START.test(line)) {
      const parsed = parseDeletedBlock(lines, index);
      deleted.push(parsed.task);
      index = parsed.nextIndex;
      continue;
    }

    const deletedMatch = line.match(DELETED_SINGLE);
    if (deletedMatch) {
      deleted.push({
        ...parseTaskMeta(deletedMatch),
        deletedAt: deletedMatch[7],
      });
      index += 1;
      continue;
    }

    if (TASK_LINE.test(rawLine)) {
      const parsed = parseTaskBlock(lines, index);
      tasks.push(parsed.task);
      index = parsed.nextIndex;
      continue;
    }

    index += 1;
  }

  for (const task of [...tasks, ...deleted]) {
    task.subtasks ??= [];
    task.notes ??= "";
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
    lines.push(...serializeTaskBody(task, ""));
  }

  if (data.deleted.length) {
    lines.push("", "## Smazané (komentáře)", "");
    for (const task of data.deleted) {
      lines.push("<!-- smazáno:");
      lines.push(...serializeTaskBody(task, ""));
      lines.push(`deleted:${task.deletedAt ?? new Date().toISOString()}`);
      lines.push("-->");
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
