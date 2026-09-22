import { parseMarkdown, serializeMarkdown, emptyDocument } from "./markdown.js";

const HANDLE_DB = "todo-pwa-handles";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "current";

/** @returns {Promise<IDBDatabase>} */
function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {FileSystemFileHandle | null} handle */
export async function persistHandle(handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    if (handle) tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    else tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** @returns {Promise<FileSystemFileHandle | null>} */
export async function loadPersistedHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** @param {FileSystemFileHandle} handle */
export async function ensureWritePermission(handle) {
  if (!handle.queryPermission) return true;
  const opts = { mode: "readwrite" };
  let permission = await handle.queryPermission(opts);
  if (permission === "granted") return true;
  if (permission === "prompt") {
    permission = await handle.requestPermission(opts);
  }
  return permission === "granted";
}

/** @param {FileSystemFileHandle} handle */
export async function readFromHandle(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  return parseMarkdown(text);
}

/** @param {FileSystemFileHandle} handle @param {ReturnType<typeof parseMarkdown>} data */
export async function writeToHandle(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(serializeMarkdown(data));
  await writable.close();
}

export async function pickOpenFile() {
  if (!window.showOpenFilePicker) {
    throw new Error("Prohlížeč nepodporuje File System Access API.");
  }
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: "Markdown",
        accept: { "text/markdown": [".md", ".markdown"] },
      },
    ],
    multiple: false,
  });
  return handle;
}

export async function pickNewFile() {
  if (!window.showSaveFilePicker) {
    throw new Error("Prohlížeč nepodporuje File System Access API.");
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: "todo.md",
    types: [
      {
        description: "Markdown",
        accept: { "text/markdown": [".md"] },
      },
    ],
  });
  const initial = emptyDocument();
  await writeToHandle(handle, initial);
  return handle;
}

export async function tryRestoreHandle() {
  const handle = await loadPersistedHandle();
  if (!handle) return null;
  const allowed = await ensureWritePermission(handle);
  return allowed ? handle : null;
}
