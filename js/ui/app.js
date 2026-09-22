import { createTask, formatDuration } from "../models/task.js";
import {
  ensureWritePermission,
  persistHandle,
  pickNewFile,
  pickOpenFile,
  readFromHandle,
  tryRestoreHandle,
  writeToHandle,
} from "../db/fileStore.js";

export class TodoApp {
  /** @type {FileSystemFileHandle | null} */
  fileHandle = null;

  /** @type {import('../db/markdown.js').parseMarkdown extends (...args: any) => infer R ? R : never} */
  data = { activeTaskId: null, tasks: [], deleted: [] };

  /** @type {import('../timer/engine.js').TimerEngine} */
  timer;

  /** @type {number | null} */
  tickInterval = null;

  /** @type {ReturnType<typeof setTimeout> | null} */
  saveTimeout = null;

  els = {
    noFile: document.getElementById("no-file"),
    workspace: document.getElementById("workspace"),
    fileName: document.getElementById("file-name"),
    activeTitle: document.querySelector("#active-task .active-task__title"),
    timerDisplay: document.getElementById("timer-display"),
    pomodoroDisplay: document.getElementById("pomodoro-display"),
    sessionDisplay: document.getElementById("session-display"),
    phaseDisplay: document.getElementById("phase-display"),
    taskList: document.getElementById("task-list"),
    addForm: document.getElementById("add-form"),
    addInput: document.getElementById("add-input"),
  };

  constructor(timer) {
    this.timer = timer;
    this.timer.onChange = () => this.renderTimer();
    this.timer.onPomodoroComplete = (taskId) => this.handlePomodoroComplete(taskId);
  }

  bind() {
    for (const id of ["btn-open", "btn-open-empty"]) {
      document.getElementById(id)?.addEventListener("click", () => this.openFile());
    }
    for (const id of ["btn-new", "btn-new-empty"]) {
      document.getElementById(id)?.addEventListener("click", () => this.newFile());
    }

    this.els.addForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.addTask(this.els.addInput.value);
      this.els.addInput.value = "";
    });
  }

  async init() {
    this.bind();
    const restored = await tryRestoreHandle();
    if (restored) {
      await this.useHandle(restored);
    }
    this.render();
  }

  async openFile() {
    try {
      const handle = await pickOpenFile();
      await this.useHandle(handle);
    } catch (error) {
      if (error?.name !== "AbortError") this.alertError(error);
    }
  }

  async newFile() {
    try {
      const handle = await pickNewFile();
      await this.useHandle(handle);
    } catch (error) {
      if (error?.name !== "AbortError") this.alertError(error);
    }
  }

  /** @param {FileSystemFileHandle} handle */
  async useHandle(handle) {
    const allowed = await ensureWritePermission(handle);
    if (!allowed) throw new Error("Chybí oprávnění k zápisu do souboru.");

    this.fileHandle = handle;
    this.data = await readFromHandle(handle);
    await persistHandle(handle);

    if (!this.data.activeTaskId && this.data.tasks.length) {
      this.data.activeTaskId = this.data.tasks.find((t) => !t.done)?.id ?? this.data.tasks[0].id;
      await this.saveNow();
    }

    this.syncTimerWithData();
    this.startTicking();
    this.render();
  }

  syncTimerWithData() {
    const active = this.data.tasks.find((t) => t.id === this.data.activeTaskId && !t.deletedAt);
    this.timer.setActiveTask(active ? active.id : null);
    if (active) this.timer.start();
    else this.timer.pause();
  }

  startTicking() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = window.setInterval(() => this.onTick(), 1000);
  }

  onTick() {
    const { elapsedMs } = this.timer.tick();
    if (!this.timer.activeTaskId || !elapsedMs) return;

    const task = this.data.tasks.find((t) => t.id === this.timer.activeTaskId);
    if (!task) return;

    if (elapsedMs >= 1000) {
      task.timeMs += elapsedMs;
      this.timer.sessionStartedAt = Date.now();
      this.scheduleSave();
      this.renderTaskList();
      this.renderActivePanel();
    }
  }

  /** @param {string} taskId */
  handlePomodoroComplete(taskId) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (task) {
      task.pomodoros += 1;
      this.scheduleSave();
      this.render();
    }
  }

  /** @param {string} title */
  async addTask(title) {
    const trimmed = title.trim();
    if (!trimmed || !this.fileHandle) return;

    const task = createTask(trimmed);
    this.data.tasks.unshift(task);
    this.data.activeTaskId = task.id;
    this.syncTimerWithData();
    await this.saveNow();
    this.render();
  }

  /** @param {string} taskId */
  async setActive(taskId) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task || task.done) return;

    this.flushElapsedTime();
    this.data.activeTaskId = taskId;
    this.syncTimerWithData();
    await this.saveNow();
    this.render();
  }

  /** @param {string} taskId */
  async toggleDone(taskId) {
    const task = this.data.tasks.find((t) => t.id === taskId);
    if (!task) return;

    task.done = !task.done;

    if (task.done && this.data.activeTaskId === taskId) {
      this.flushElapsedTime();
      const next = this.data.tasks.find((t) => !t.done && t.id !== taskId);
      this.data.activeTaskId = next?.id ?? null;
      this.syncTimerWithData();
    } else if (!task.done && !this.data.activeTaskId) {
      this.data.activeTaskId = taskId;
      this.syncTimerWithData();
    }

    await this.saveNow();
    this.render();
  }

  /** @param {string} taskId */
  async deleteTask(taskId) {
    const index = this.data.tasks.findIndex((t) => t.id === taskId);
    if (index === -1) return;

    if (this.data.activeTaskId === taskId) {
      this.flushElapsedTime();
    }

    const [removed] = this.data.tasks.splice(index, 1);
    removed.deletedAt = new Date().toISOString();
    this.data.deleted.push(removed);

    if (this.data.activeTaskId === taskId) {
      const next = this.data.tasks.find((t) => !t.done) ?? this.data.tasks[0] ?? null;
      this.data.activeTaskId = next?.id ?? null;
      this.syncTimerWithData();
    }

    await this.saveNow();
    this.render();
  }

  flushElapsedTime() {
    const elapsed = this.timer.getElapsedMs();
    if (!elapsed || !this.timer.activeTaskId) return;
    const task = this.data.tasks.find((t) => t.id === this.timer.activeTaskId);
    if (task) task.timeMs += elapsed;
    this.timer.sessionStartedAt = Date.now();
  }

  scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.saveNow(), 400);
  }

  async saveNow() {
    if (!this.fileHandle) return;
    this.flushElapsedTime();
    await writeToHandle(this.fileHandle, this.data);
  }

  render() {
    const hasFile = Boolean(this.fileHandle);
    this.els.noFile.classList.toggle("hidden", hasFile);
    this.els.workspace.classList.toggle("hidden", !hasFile);
    this.els.fileName.textContent = hasFile ? this.fileHandle.name : "Žádný soubor";
    this.renderActivePanel();
    this.renderTaskList();
    this.renderTimer();
  }

  renderActivePanel() {
    const active = this.data.tasks.find((t) => t.id === this.data.activeTaskId);
    this.els.activeTitle.textContent = active?.title ?? "Vyberte úkol kliknutím";
    this.els.pomodoroDisplay.textContent = String(active?.pomodoros ?? 0);
    this.els.timerDisplay.textContent = formatDuration(
      (active?.timeMs ?? 0) + (this.timer.activeTaskId === active?.id ? this.timer.getElapsedMs() : 0)
    );
  }

  renderTimer() {
    this.els.sessionDisplay.textContent = this.timer.sessionText ?? "25:00";
    this.els.phaseDisplay.textContent = this.timer.phaseLabel ?? "Práce";
    this.renderActivePanel();
  }

  renderTaskList() {
    this.els.taskList.innerHTML = "";

    if (!this.data.tasks.length) {
      const empty = document.createElement("li");
      empty.className = "task-item";
      empty.style.cursor = "default";
      empty.innerHTML = `<div class="task-item__body"><span class="task-item__title" style="color:var(--muted)">Zatím žádné úkoly</span></div>`;
      this.els.taskList.append(empty);
      return;
    }

    for (const task of this.data.tasks) {
      const li = document.createElement("li");
      li.className = "task-item";
      if (task.id === this.data.activeTaskId) li.classList.add("task-item--active");
      if (task.done) li.classList.add("task-item--done");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-item__checkbox";
      checkbox.checked = task.done;
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => this.toggleDone(task.id));

      const body = document.createElement("div");
      body.className = "task-item__body";
      const liveExtra =
        task.id === this.data.activeTaskId && this.timer.activeTaskId === task.id
          ? this.timer.getElapsedMs()
          : 0;
      body.innerHTML = `
        <div class="task-item__title">${escapeHtml(task.title)}</div>
        <div class="task-item__meta">${formatDuration(task.timeMs + liveExtra)} · ${task.pomodoros} pomodoro</div>
      `;

      const actions = document.createElement("div");
      actions.className = "task-item__actions";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--danger";
      del.textContent = "Smazat";
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        this.deleteTask(task.id);
      });
      actions.append(del);

      li.append(checkbox, body, actions);
      li.addEventListener("click", () => this.setActive(task.id));
      this.els.taskList.append(li);
    }
  }

  /** @param {unknown} error */
  alertError(error) {
    const message = error instanceof Error ? error.message : String(error);
    window.alert(message);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
