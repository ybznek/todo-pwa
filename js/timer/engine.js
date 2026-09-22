import { formatDuration, formatSession } from "../models/task.js";

const WORK_MS = 25 * 60 * 1000;
const BREAK_MS = 5 * 60 * 1000;

export class TimerEngine {
  /** @type {((payload: object) => void) | null} */
  onChange = null;

  /** @type {((taskId: string) => void) | null} */
  onPomodoroComplete = null;

  activeTaskId = null;
  phase = "work";
  phaseEndsAt = 0;
  sessionStartedAt = 0;
  running = false;

  /** @param {string | null} taskId */
  setActiveTask(taskId) {
    this.activeTaskId = taskId;
    this.resetSession("work");
    this.emit();
  }

  start() {
    if (!this.activeTaskId) return;
    if (!this.running) {
      this.running = true;
      this.sessionStartedAt = Date.now();
      if (!this.phaseEndsAt) {
        this.phaseEndsAt = this.sessionStartedAt + WORK_MS;
      }
    }
    this.emit();
  }

  pause() {
    this.running = false;
    this.emit();
  }

  /** @returns {number} */
  getElapsedMs() {
    if (!this.running || !this.sessionStartedAt) return 0;
    return Date.now() - this.sessionStartedAt;
  }

  /** @returns {number} */
  getSessionRemainingMs() {
    if (!this.phaseEndsAt) return WORK_MS;
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  /** @param {"work" | "break"} nextPhase */
  resetSession(nextPhase) {
    this.phase = nextPhase;
    this.sessionStartedAt = Date.now();
    this.phaseEndsAt = this.sessionStartedAt + (nextPhase === "work" ? WORK_MS : BREAK_MS);
    this.running = Boolean(this.activeTaskId);
  }

  tick() {
    if (!this.activeTaskId) return { elapsedMs: 0, pomodoroFinished: false };

    let elapsedMs = this.getElapsedMs();
    let pomodoroFinished = false;

    if (this.running && this.phaseEndsAt && Date.now() >= this.phaseEndsAt) {
      if (this.phase === "work") {
        pomodoroFinished = true;
        this.onPomodoroComplete?.(this.activeTaskId);
        this.resetSession("break");
      } else {
        this.resetSession("work");
      }
      elapsedMs = this.getElapsedMs();
    }

    this.emit();
    return { elapsedMs, pomodoroFinished };
  }

  emit() {
    this.timerText = formatDuration(this.getElapsedMs());
    this.sessionText = formatSession(this.getSessionRemainingMs());
    this.phaseLabel = this.phase === "work" ? "Práce" : "Pauza";
    this.onChange?.({
      activeTaskId: this.activeTaskId,
      running: this.running,
      phase: this.phase,
      timerText: this.timerText,
      sessionText: this.sessionText,
      phaseLabel: this.phaseLabel,
    });
  }
}
