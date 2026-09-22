import { emptyDocument, parseMarkdown, serializeMarkdown, type TodoDocument } from "./markdown";

const HANDLE_DB = "todo-pwa-handles";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "current";

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function persistHandle(handle: FileSystemFileHandle | null): Promise<void> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    if (handle) tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    else tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersistedHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemFileHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
  let permission = await handle.queryPermission(opts);
  if (permission === "granted") return true;
  if (permission === "prompt") {
    permission = await handle.requestPermission(opts);
  }
  return permission === "granted";
}

export async function readFromHandle(handle: FileSystemFileHandle): Promise<TodoDocument> {
  const file = await handle.getFile();
  const text = await file.text();
  return parseMarkdown(text);
}

export async function writeToHandle(handle: FileSystemFileHandle, data: TodoDocument): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(serializeMarkdown(data));
  await writable.close();
}

export async function pickOpenFile(): Promise<FileSystemFileHandle> {
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

export async function pickNewFile(): Promise<FileSystemFileHandle> {
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
  await writeToHandle(handle, emptyDocument());
  return handle;
}

export async function tryRestoreHandle(): Promise<FileSystemFileHandle | null> {
  const handle = await loadPersistedHandle();
  if (!handle) return null;
  const allowed = await ensureWritePermission(handle);
  return allowed ? handle : null;
}
