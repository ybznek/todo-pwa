import { parseMarkdown, serializeMarkdown, emptyDocument } from "../js/db/markdown.js";
import { createTask } from "../js/models/task.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const task = createTask("Napsat report");
task.timeMs = 125000;
task.pomodoros = 2;

const data = emptyDocument([task]);
data.activeTaskId = task.id;

const markdown = serializeMarkdown(data);
const parsed = parseMarkdown(markdown);

assert(parsed.activeTaskId === task.id, "active task id");
assert(parsed.tasks.length === 1, "one task");
assert(parsed.tasks[0].title === "Napsat report", "title");
assert(parsed.tasks[0].timeMs === 125000, "time");
assert(parsed.tasks[0].pomodoros === 2, "pomodoros");

const deleted = { ...task, id: "deleted-id", deletedAt: new Date().toISOString() };
const withDeleted = {
  activeTaskId: null,
  tasks: [],
  deleted: [deleted],
};

const deletedMd = serializeMarkdown(withDeleted);
assert(deletedMd.includes("<!-- smazáno:"), "deleted comment present");

const roundTrip = parseMarkdown(deletedMd);
assert(roundTrip.deleted.length === 1, "deleted round trip");
assert(roundTrip.deleted[0].title === "Napsat report", "deleted title");

console.log("markdown tests passed");
