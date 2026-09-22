import {
  looksLikeBulletList,
  parseSubtaskBullets,
  parseTaskTree,
  subtasksToBulletText,
} from "../db/bullets";
import type { TodoDocument } from "../db/markdown";
import { pickNewFile, pickOpenFile } from "../db/fileStore";
import {
  createDocumentFallback,
  createDocumentNative,
  downloadMarkdown,
  isNativeFileAccessAvailable,
  openDocumentFromFile,
  openDocumentNative,
  pickFileViaInput,
  restoreDocument,
  storageModeHint,
  type TodoStorage,
} from "../db/storage";
import { createSubtask, createTask, formatDuration, subtaskProgress, type Task } from "../models/task";
import { ensureNotificationPermission, showAppNotification } from "../notifications/notifier";
import type { TimerEngine } from "../timer/engine";

const APP_TITLE = "Todo PWA";

interface AppElements {
  noFile: HTMLElement;
  workspace: HTMLElement;
  storageBanner: HTMLElement;
  fileName: HTMLElement;
  activeTitle: HTMLElement;
  activeDetails: HTMLElement;
  activeNotes: HTMLTextAreaElement;
  subtasksEditor: HTMLTextAreaElement;
  timerDisplay: HTMLElement;
  pomodoroDisplay: HTMLElement;
  sessionDisplay: HTMLElement;
  phaseDisplay: HTMLElement;
  taskList: HTMLUListElement;
  addForm: HTMLFormElement;
  addInput: HTMLTextAreaElement;
  btnDownload: HTMLButtonElement;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Chybí element #${id}`);
  return element as T;
}

export class TodoApp {
  storage: TodoStorage | null = null;
  data: TodoDocument = { activeTaskId: null, tasks: [], deleted: [] };
  tickInterval: number | null = null;
  saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeNotesTaskId: string | null = null;
  private activeSubtasksTaskId: string | null = null;

  private readonly els: AppElements;
  private readonly timer: TimerEngine;

  constructor(timer: TimerEngine) {
    this.timer = timer;
    this.els = {
      noFile: requireElement("no-file"),
      workspace: requireElement("workspace"),
      storageBanner: requireElement("storage-banner"),
      fileName: requireElement("file-name"),
      activeTitle: document.querySelector("#active-task .active-task__title") as HTMLElement,
      activeDetails: requireElement("active-details"),
      activeNotes: requireElement("active-notes"),
      subtasksEditor: requireElement("subtasks-editor"),
      timerDisplay: requireElement("timer-display"),
      pomodoroDisplay: requireElement("pomodoro-display"),
      sessionDisplay: requireElement("session-display"),
      phaseDisplay: requireElement("phase-display"),
      taskList: requireElement("task-list"),
      addForm: requireElement("add-form"),
      addInput: requireElement("add-input"),
      btnDownload: requireElement("btn-download"),
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
      void this.addFromInput(this.els.addInput.value);
      this.els.addInput.value = "";
    });

    this.els.activeNotes.addEventListener("input", () => {
      const active = this.getActiveTask();
      if (!active) return;
      active.notes = this.els.activeNotes.value;
      this.scheduleSave();
    });

    this.els.subtasksEditor.addEventListener("input", () => {
      const active = this.getActiveTask();
      if (!active) return;
      active.subtasks = parseSubtaskBullets(this.els.subtasksEditor.value, active.subtasks);
      this.scheduleSave();
      this.renderTaskList();
    });

    this.els.btnDownload.addEventListener("click", () => this.exportMarkdown());
  }

  async init(): Promise<void> {
    this.bind();
    const restored = await restoreDocument();
    if (restored) await this.useStorage(restored);
    this.render();
  }

  async openFile(): Promise<void> {
    try {
      if (isNativeFileAccessAvailable()) {
        await this.useStorage(await openDocumentNative(await pickOpenFile()));
        return;
      }
      await this.useStorage(await openDocumentFromFile(await pickFileViaInput()));
    } catch (error) {
      if (!isAbortError(error)) this.alertError(error);
    }
  }

  async newFile(): Promise<void> {
    try {
      if (isNativeFileAccessAvailable()) {
        await this.useStorage(await createDocumentNative(await pickNewFile()));
        return;
      }
      await this.useStorage(await createDocumentFallback());
    } catch (error) {
      if (!isAbortError(error)) this.alertError(error);
    }
  }

  async useStorage(storage: TodoStorage): Promise<void> {
    this.storage = storage;
    this.data = await storage.read();

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

  private getActiveTask(): Task | undefined {
    return this.data.tasks.find((task) => task.id === this.data.activeTaskId);
  }

  private syncTimerWithData(): void {
    const active = this.getActiveTask();
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

  async addFromInput(raw: string): Promise<void> {
    const trimmed = raw.trim();
    if (!trimmed || !this.storage) return;

    if (looksLikeBulletList(trimmed)) {
      const parsedTasks = parseTaskTree(trimmed);
      if (!parsedTasks.length) return;

      const createdIds: string[] = [];
      for (const item of [...parsedTasks].reverse()) {
        const task = createTask(item.title);
        task.done = item.done;
        task.subtasks = item.subtasks.map((subtask) => ({
          ...createSubtask(subtask.title),
          done: subtask.done,
        }));
        this.data.tasks.unshift(task);
        createdIds.unshift(task.id);
      }

      this.data.activeTaskId = createdIds[0] ?? null;
    } else {
      const task = createTask(trimmed);
      this.data.tasks.unshift(task);
      this.data.activeTaskId = task.id;
    }

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
    if (!this.storage) return;
    this.flushElapsedTime();
    await this.storage.write(this.data);
  }

  exportMarkdown(): void {
    if (!this.storage) return;
    this.flushElapsedTime();
    downloadMarkdown(this.storage.name, this.data);
  }

  render(): void {
    const hasFile = Boolean(this.storage);
    this.els.noFile.classList.toggle("hidden", hasFile);
    this.els.workspace.classList.toggle("hidden", !hasFile);
    this.els.fileName.textContent = hasFile ? this.storage!.name : "Žádný soubor";
    this.els.storageBanner.textContent = storageModeHint(this.storage?.mode ?? null);
    this.els.storageBanner.classList.toggle("hidden", !hasFile);
    this.els.storageBanner.classList.toggle("storage-banner--native", this.storage?.mode === "native");
    this.els.storageBanner.classList.toggle("storage-banner--fallback", this.storage?.mode === "fallback");
    this.els.btnDownload.classList.toggle("hidden", !hasFile || this.storage?.mode === "native");
    this.renderActivePanel();
    this.renderActiveDetails();
    this.renderTaskList();
    this.renderTimer();
    this.updateDocumentTitle();
  }

  private updateDocumentTitle(): void {
    const active = this.getActiveTask();
    document.title = active ? `${active.title} · ${APP_TITLE}` : APP_TITLE;
  }

  private renderActivePanel(): void {
    const active = this.getActiveTask();
    this.els.activeTitle.textContent = active?.title ?? "Vyberte úkol kliknutím";
    this.els.pomodoroDisplay.textContent = String(active?.pomodoros ?? 0);
    this.els.timerDisplay.textContent = formatDuration(
      (active?.timeMs ?? 0) +
        (this.timer.activeTaskId === active?.id ? this.timer.getElapsedMs() : 0),
    );
  }

  private renderActiveDetails(): void {
    const active = this.getActiveTask();
    const hasActive = Boolean(active && !active.done);
    this.els.activeDetails.classList.toggle("hidden", !hasActive);

    if (!active || active.done) {
      this.activeNotesTaskId = null;
      this.activeSubtasksTaskId = null;
      return;
    }

    if (this.activeNotesTaskId !== active.id) {
      this.els.activeNotes.value = active.notes;
      this.activeNotesTaskId = active.id;
    }

    if (this.activeSubtasksTaskId !== active.id) {
      this.els.subtasksEditor.value = subtasksToBulletText(active.subtasks);
      this.activeSubtasksTaskId = active.id;
    }
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
      const progress = subtaskProgress(task);
      const badge =
        progress.total > 0
          ? `<span class="task-item__badge">${progress.done}/${progress.total}</span>`
          : task.notes.trim()
            ? `<span class="task-item__badge">📝</span>`
            : "";

      body.innerHTML = `
        <div class="task-item__title">${escapeHtml(task.title)}${badge}</div>
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
