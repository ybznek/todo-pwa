import { formatDuration, formatSession } from "../models/task";

const WORK_MS = 25 * 60 * 1000;
const BREAK_MS = 5 * 60 * 1000;

export type TimerPhase = "work" | "break";

export interface TimerState {
  activeTaskId: string | null;
  running: boolean;
  phase: TimerPhase;
  timerText: string;
  sessionText: string;
  phaseLabel: string;
}

export class TimerEngine {
  onChange: ((state: TimerState) => void) | null = null;
  onPomodoroComplete: ((taskId: string) => void) | null = null;

  activeTaskId: string | null = null;
  phase: TimerPhase = "work";
  phaseEndsAt = 0;
  sessionStartedAt = 0;
  running = false;

  timerText = "00:00:00";
  sessionText = "25:00";
  phaseLabel = "Práce";

  setActiveTask(taskId: string | null): void {
    this.activeTaskId = taskId;
    this.resetSession("work");
    this.emit();
  }

  start(): void {
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

  pause(): void {
    this.running = false;
    this.emit();
  }

  getElapsedMs(): number {
    if (!this.running || !this.sessionStartedAt) return 0;
    return Date.now() - this.sessionStartedAt;
  }

  getSessionRemainingMs(): number {
    if (!this.phaseEndsAt) return WORK_MS;
    return Math.max(0, this.phaseEndsAt - Date.now());
  }

  resetSession(nextPhase: TimerPhase): void {
    this.phase = nextPhase;
    this.sessionStartedAt = Date.now();
    this.phaseEndsAt = this.sessionStartedAt + (nextPhase === "work" ? WORK_MS : BREAK_MS);
    this.running = Boolean(this.activeTaskId);
  }

  tick(): { elapsedMs: number; pomodoroFinished: boolean } {
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

  private emit(): void {
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
