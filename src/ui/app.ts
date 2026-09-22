import type { TodoDocument } from "../db/markdown";
import {
  ensureWritePermission,
  persistHandle,
  pickNewFile,
  pickOpenFile,
  readFromHandle,
  tryRestoreHandle,
  writeToHandle,
} from "../db/fileStore";
import { createTask, formatDuration } from "../models/task";
import { ensureNotificationPermission, showAppNotification } from "../notifications/notifier";
import type { TimerEngine } from "../timer/engine";

interface AppElements {
  noFile: HTMLElement;
  workspace: HTMLElement;
  fileName: HTMLElement;
  activeTitle: HTMLElement;
  timerDisplay: HTMLElement;
  pomodoroDisplay: HTMLElement;
  sessionDisplay: HTMLElement;
  phaseDisplay: HTMLElement;
  taskList: HTMLUListElement;
  addForm: HTMLFormElement;
  addInput: HTMLInputElement;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Chybí element #${id}`);
  return element as T;
}

export class TodoApp {
  fileHandle: FileSystemFileHandle | null = null;
  data: TodoDocument = { activeTaskId: null, tasks: [], deleted: [] };
  tickInterval: number | null = null;
  saveTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly els: AppElements;
  private readonly timer: TimerEngine;

  constructor(timer: TimerEngine) {
    this.timer = timer;
    this.els = {
      noFile: requireElement("no-file"),
      workspace: requireElement("workspace"),
      fileName: requireElement("file-name"),
      activeTitle: document.querySelector("#active-task .active-task__title") as HTMLElement,
      timerDisplay: requireElement("timer-display"),
      pomodoroDisplay: requireElement("pomodoro-display"),
      sessionDisplay: requireElement("session-display"),
      phaseDisplay: requireElement("phase-display"),
      taskList: requireElement("task-list"),
      addForm: requireElement("add-form"),
      addInput: requireElement("add-input"),
    };

    this.timer.onChange = () => this.renderTimer();
    this.timer.onPomodoroComplete = (taskId) => this.handlePomodoroComplete(taskId);
    this.timer.onBreakComplete = (taskId) => this.handleBreakComplete(taskId);
  }

  bind(): void {
    for (const id of ["btn-open", "btn-open-empty"]) {
      requireElement<HTMLButtonElement>(id).addEventListener("click", () => void this.openFile());
    }
    for (const id of ["btn-new", "btn-new-empty"]) {
      requireElement<HTMLButtonElement>(id).addEventListener("click", () => void this.newFile());
    }

    this.els.addForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.addTask(this.els.addInput.value);
      this.els.addInput.value = "";
    });
  }

  async init(): Promise<void> {
    this.bind();
    const restored = await tryRestoreHandle();
    if (restored) await this.useHandle(restored);
    this.render();
  }

  async openFile(): Promise<void> {
    try {
      await this.useHandle(await pickOpenFile());
    } catch (error) {
      if (!isAbortError(error)) this.alertError(error);
    }
  }

  async newFile(): Promise<void> {
    try {
      await this.useHandle(await pickNewFile());
    } catch (error) {
      if (!isAbortError(error)) this.alertError(error);
    }
  }

  async useHandle(handle: FileSystemFileHandle): Promise<void> {
    const allowed = await ensureWritePermission(handle);
    if (!allowed) throw new Error("Chybí oprávnění k zápisu do souboru.");

    this.fileHandle = handle;
    this.data = await readFromHandle(handle);
    await persistHandle(handle);

    if (!this.data.activeTaskId && this.data.tasks.length) {
      this.data.activeTaskId =
        this.data.tasks.find((task) => !task.done)?.id ?? this.data.tasks[0]?.id ?? null;
      await this.saveNow();
    }

    this.syncTimerWithData();
    this.startTicking();
    void ensureNotificationPermission();
    this.render();
  }

  private syncTimerWithData(): void {
    const active = this.data.tasks.find((task) => task.id === this.data.activeTaskId);
    this.timer.setActiveTask(active && !active.done ? active.id : null);
    if (active && !active.done) this.timer.start();
    else this.timer.pause();
  }

  private startTicking(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = window.setInterval(() => this.onTick(), 1000);
  }

  private onTick(): void {
    const { elapsedMs } = this.timer.tick();
    if (!this.timer.activeTaskId || elapsedMs < 1000) return;

    const task = this.data.tasks.find((item) => item.id === this.timer.activeTaskId);
    if (!task) return;

    task.timeMs += elapsedMs;
    this.timer.sessionStartedAt = Date.now();
    this.scheduleSave();
    this.renderTaskList();
    this.renderActivePanel();
  }

  private handlePomodoroComplete(taskId: string): void {
    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    task.pomodoros += 1;
    void showAppNotification("Pomodoro dokončeno", `${task.title} — čas na 5min pauzu.`);
    void this.saveNow();
    this.render();
  }

  private handleBreakComplete(taskId: string): void {
    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    void showAppNotification("Pauza skončila", `${task.title} — zpět do práce.`);
  }

  async addTask(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed || !this.fileHandle) return;

    const task = createTask(trimmed);
    this.data.tasks.unshift(task);
    this.data.activeTaskId = task.id;
    this.syncTimerWithData();
    await this.saveNow();
    this.render();
  }

  async setActive(taskId: string): Promise<void> {
    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task || task.done) return;

    this.flushElapsedTime();
    this.data.activeTaskId = taskId;
    this.syncTimerWithData();
    await this.saveNow();
    this.render();
  }

  async toggleDone(taskId: string): Promise<void> {
    const task = this.data.tasks.find((item) => item.id === taskId);
    if (!task) return;

    task.done = !task.done;

    if (task.done && this.data.activeTaskId === taskId) {
      this.flushElapsedTime();
      const next = this.data.tasks.find((item) => !item.done && item.id !== taskId);
      this.data.activeTaskId = next?.id ?? null;
      this.syncTimerWithData();
    } else if (!task.done && !this.data.activeTaskId) {
      this.data.activeTaskId = taskId;
      this.syncTimerWithData();
    }

    await this.saveNow();
    this.render();
  }

  async deleteTask(taskId: string): Promise<void> {
    const index = this.data.tasks.findIndex((item) => item.id === taskId);
    if (index === -1) return;

    if (this.data.activeTaskId === taskId) this.flushElapsedTime();

    const [removed] = this.data.tasks.splice(index, 1);
    removed.deletedAt = new Date().toISOString();
    this.data.deleted.push(removed);

    if (this.data.activeTaskId === taskId) {
      const next = this.data.tasks.find((item) => !item.done) ?? this.data.tasks[0] ?? null;
      this.data.activeTaskId = next?.id ?? null;
      this.syncTimerWithData();
    }

    await this.saveNow();
    this.render();
  }

  private flushElapsedTime(): void {
    const elapsed = this.timer.getElapsedMs();
    if (!elapsed || !this.timer.activeTaskId) return;
    const task = this.data.tasks.find((item) => item.id === this.timer.activeTaskId);
    if (task) task.timeMs += elapsed;
    this.timer.sessionStartedAt = Date.now();
  }

  private scheduleSave(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => void this.saveNow(), 400);
  }

  async saveNow(): Promise<void> {
    if (!this.fileHandle) return;
    this.flushElapsedTime();
    await writeToHandle(this.fileHandle, this.data);
  }

  render(): void {
    const hasFile = Boolean(this.fileHandle);
    this.els.noFile.classList.toggle("hidden", hasFile);
    this.els.workspace.classList.toggle("hidden", !hasFile);
    this.els.fileName.textContent = hasFile ? this.fileHandle!.name : "Žádný soubor";
    this.renderActivePanel();
    this.renderTaskList();
    this.renderTimer();
  }

  private renderActivePanel(): void {
    const active = this.data.tasks.find((task) => task.id === this.data.activeTaskId);
    this.els.activeTitle.textContent = active?.title ?? "Vyberte úkol kliknutím";
    this.els.pomodoroDisplay.textContent = String(active?.pomodoros ?? 0);
    this.els.timerDisplay.textContent = formatDuration(
      (active?.timeMs ?? 0) +
        (this.timer.activeTaskId === active?.id ? this.timer.getElapsedMs() : 0),
    );
  }

  private renderTimer(): void {
    this.els.sessionDisplay.textContent = this.timer.sessionText;
    this.els.phaseDisplay.textContent = this.timer.phaseLabel;
    this.renderActivePanel();
  }

  private renderTaskList(): void {
    this.els.taskList.replaceChildren();

    if (!this.data.tasks.length) {
      const empty = document.createElement("li");
      empty.className = "task-item";
      empty.style.cursor = "default";
      empty.innerHTML =
        '<div class="task-item__body"><span class="task-item__title" style="color:var(--muted)">Zatím žádné úkoly</span></div>';
      this.els.taskList.append(empty);
      return;
    }

    for (const task of this.data.tasks) {
      const item = document.createElement("li");
      item.className = "task-item";
      if (task.id === this.data.activeTaskId) item.classList.add("task-item--active");
      if (task.done) item.classList.add("task-item--done");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-item__checkbox";
      checkbox.checked = task.done;
      checkbox.addEventListener("click", (event) => event.stopPropagation());
      checkbox.addEventListener("change", () => void this.toggleDone(task.id));

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
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn--danger";
      deleteButton.textContent = "Smazat";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.deleteTask(task.id);
      });
      actions.append(deleteButton);

      item.append(checkbox, body, actions);
      item.addEventListener("click", () => void this.setActive(task.id));
      this.els.taskList.append(item);
    }
  }

  private alertError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    window.alert(message);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
