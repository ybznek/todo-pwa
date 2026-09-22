import { createSubtask, type Subtask } from "../models/task";

export interface ParsedBullet {
  level: number;
  title: string;
  done: boolean;
}

export interface ParsedTaskTree {
  title: string;
  done: boolean;
  subtasks: Array<{ title: string; done: boolean }>;
}

const BULLET_LINE =
  /^(\s*)([-*+])\s+(?:\[([ xX])\]\s+)?(.+?)\s*$/;

export function looksLikeBulletList(text: string): boolean {
  return text.split(/\r?\n/).some((line) => BULLET_LINE.test(line));
}

export function parseBulletLines(text: string): ParsedBullet[] {
  const items: ParsedBullet[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    const match = rawLine.match(BULLET_LINE);
    if (!match) continue;

    const indent = match[1].replace(/\t/g, "  ").length;
    items.push({
      level: Math.floor(indent / 2),
      title: match[4].trim(),
      done: (match[3] ?? " ").toLowerCase() === "x",
    });
  }

  return items;
}

export function parseTaskTree(text: string): ParsedTaskTree[] {
  const lines = parseBulletLines(text);
  const tasks: ParsedTaskTree[] = [];
  let current: ParsedTaskTree | null = null;

  for (const line of lines) {
    if (line.level === 0) {
      current = { title: line.title, done: line.done, subtasks: [] };
      tasks.push(current);
      continue;
    }

    if (line.level === 1 && current) {
      current.subtasks.push({ title: line.title, done: line.done });
      continue;
    }

    if (line.level >= 2 && current) {
      current.subtasks.push({ title: line.title, done: line.done });
    }
  }

  return tasks;
}

export function subtasksToBulletText(subtasks: Subtask[]): string {
  return subtasks
    .map((subtask) => `- [${subtask.done ? "x" : " "}] ${subtask.title}`)
    .join("\n");
}

export function mergeSubtasks(existing: Subtask[], parsed: Array<{ title: string; done: boolean }>): Subtask[] {
  const byTitle = new Map(existing.map((subtask) => [subtask.title, subtask]));

  return parsed.map((item) => {
    const previous = byTitle.get(item.title);
    if (previous) {
      return { ...previous, done: item.done };
    }
    return { ...createSubtask(item.title), done: item.done };
  });
}

export function parseSubtaskBullets(text: string, existing: Subtask[] = []): Subtask[] {
  const parsed = parseBulletLines(text)
    .filter((line) => line.level === 0)
    .map((line) => ({ title: line.title, done: line.done }));

  return mergeSubtasks(existing, parsed);
}
