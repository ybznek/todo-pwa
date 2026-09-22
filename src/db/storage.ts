import { emptyDocument, parseMarkdown, serializeMarkdown, type TodoDocument } from "./markdown";
import {
  ensureWritePermission,
  loadPersistedHandle,
  persistHandle,
  readFromHandle,
  writeToHandle,
} from "./fileStore";

export type StorageMode = "native" | "fallback";

export interface TodoStorage {
  readonly name: string;
  readonly mode: StorageMode;
  read(): Promise<TodoDocument>;
  write(data: TodoDocument): Promise<void>;
}

const DATA_DB = "todo-pwa-data";
const DATA_STORE = "documents";
const DATA_KEY = "current";

interface FallbackRecord {
  fileName: string;
  markdown: string;
  updatedAt: string;
}

export function isNativeFileAccessAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

function openDataDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATA_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DATA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFallbackRecord(record: FallbackRecord): Promise<void> {
  const db = await openDataDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, "readwrite");
    tx.objectStore(DATA_STORE).put(record, DATA_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadFallbackRecord(): Promise<FallbackRecord | null> {
  const db = await openDataDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, "readonly");
    const request = tx.objectStore(DATA_STORE).get(DATA_KEY);
    request.onsuccess = () => resolve((request.result as FallbackRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

function createNativeStorage(handle: FileSystemFileHandle): TodoStorage {
  return {
    name: handle.name,
    mode: "native",
    read: () => readFromHandle(handle),
    write: async (data) => {
      const allowed = await ensureWritePermission(handle);
      if (!allowed) throw new Error("Chybí oprávnění k zápisu do souboru.");
      await writeToHandle(handle, data);
      await persistHandle(handle);
    },
  };
}

function createFallbackStorage(fileName: string, data: TodoDocument): TodoStorage {
  return {
    name: fileName,
    mode: "fallback",
    read: async () => parseMarkdown((await loadFallbackRecord())?.markdown ?? serializeMarkdown(data)),
    write: async (next) => {
      await saveFallbackRecord({
        fileName,
        markdown: serializeMarkdown(next),
        updatedAt: new Date().toISOString(),
      });
    },
  };
}

export function pickFileViaInput(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) resolve(file);
      else reject(new DOMException("The user aborted a request.", "AbortError"));
    });
    input.click();
  });
}

export async function restoreDocument(): Promise<TodoStorage | null> {
  if (isNativeFileAccessAvailable()) {
    const handle = await loadPersistedHandle();
    if (!handle) return null;
    const allowed = await ensureWritePermission(handle);
    return allowed ? createNativeStorage(handle) : null;
  }

  const record = await loadFallbackRecord();
  if (!record) return null;
  return createFallbackStorage(record.fileName, parseMarkdown(record.markdown));
}

export async function openDocumentNative(handle: FileSystemFileHandle): Promise<TodoStorage> {
  const storage = createNativeStorage(handle);
  await persistHandle(handle);
  return storage;
}

export async function openDocumentFromFile(file: File): Promise<TodoStorage> {
  const data = parseMarkdown(await file.text());
  const storage = createFallbackStorage(file.name, data);
  await storage.write(data);
  return storage;
}

export async function createDocumentNative(handle: FileSystemFileHandle): Promise<TodoStorage> {
  await writeToHandle(handle, emptyDocument());
  return openDocumentNative(handle);
}

export async function createDocumentFallback(): Promise<TodoStorage> {
  const data = emptyDocument();
  const storage = createFallbackStorage("todo.md", data);
  await storage.write(data);
  return storage;
}

export function downloadMarkdown(name: string, data: TodoDocument): void {
  const blob = new Blob([serializeMarkdown(data)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.endsWith(".md") ? name : `${name}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function storageModeHint(mode: StorageMode | null): string {
  if (mode === "native") return "Přímý zápis do souboru na disku";
  if (mode === "fallback") {
    return "Režim bez File System API — data v prohlížeči, export přes «Stáhnout .md»";
  }
  return "Pro přímý zápis otevřete appku přes HTTPS nebo localhost v Chromu";
}
