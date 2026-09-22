import { describe, expect, it } from "vitest";
import {
  looksLikeBulletList,
  parseSubtaskBullets,
  parseTaskTree,
  subtasksToBulletText,
} from "./bullets";
import { createSubtask } from "../models/task";

describe("bullet parser", () => {
  it("detects bullet lists", () => {
    expect(looksLikeBulletList("- úkol")).toBe(true);
    expect(looksLikeBulletList("jen text")).toBe(false);
  });

  it("parses nested tasks and subtasks", () => {
    const text = `- Nákup
  - [ ] Mléko
  - [x] Chleba
- Úklid
  - vysát`;

    expect(parseTaskTree(text)).toEqual([
      {
        title: "Nákup",
        done: false,
        subtasks: [
          { title: "Mléko", done: false },
          { title: "Chleba", done: true },
        ],
      },
      {
        title: "Úklid",
        done: false,
        subtasks: [{ title: "vysát", done: false }],
      },
    ]);
  });

  it("round-trips subtasks as bullet text", () => {
    const subtasks = [createSubtask("Mléko"), { ...createSubtask("Chleba"), done: true }];
    const text = subtasksToBulletText(subtasks);
    const parsed = parseSubtaskBullets(text, subtasks);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe("Mléko");
    expect(parsed[1].done).toBe(true);
    expect(parsed[0].id).toBe(subtasks[0].id);
  });
});
