/** @typedef {{ id: string, title: string, done: boolean, timeMs: number, pomodoros: number, created: string, deletedAt?: string }} Task */

export function createTask(title) {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    timeMs: 0,
    pomodoros: 0,
    created: new Date().toISOString(),
  };
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatSession(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
