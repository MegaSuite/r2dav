import { encodeKey } from "./types";

export interface DroppedItem {
  file: File;
  basedir: string;
}

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => ReaderLike;
}

interface ReaderLike {
  readEntries: (
    success: (entries: EntryLike[]) => void,
    failure: (error: unknown) => void
  ) => void;
}

function readFile(entry: EntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) {
      reject(new Error("Cannot read dropped file"));
      return;
    }
    entry.file(resolve, reject);
  });
}

function readAllEntries(reader: ReaderLike): Promise<EntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: EntryLike[] = [];
    const read = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all);
          return;
        }
        all.push(...batch);
        read();
      }, reject);
    };
    read();
  });
}

async function walk(
  entry: EntryLike,
  prefix: string,
  out: DroppedItem[]
): Promise<void> {
  if (entry.isFile) {
    out.push({ file: await readFile(entry), basedir: prefix });
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;

  const nextPrefix = `${prefix}${entry.name}/`;
  const children = await readAllEntries(entry.createReader());
  for (const child of children) {
    await walk(child, nextPrefix, out);
  }
}

/**
 * Collect dropped files, including directories (Chromium/WebKit).
 * Falls back to DataTransfer.files when entries are unavailable.
 */
export async function collectDroppedItems(
  dataTransfer: DataTransfer,
  cwd: string
): Promise<DroppedItem[]> {
  const entries: EntryLike[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    const entry = (
      item as unknown as { webkitGetAsEntry?: () => EntryLike | null }
    ).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (!entries.length) {
    return Array.from(dataTransfer.files).map((file) => ({
      file,
      basedir: cwd,
    }));
  }

  const out: DroppedItem[] = [];
  for (const entry of entries) await walk(entry, cwd, out);
  return out;
}

/** Create all intermediate R2 pseudo-folders before uploading. */
export async function ensureDroppedDirectories(
  items: DroppedItem[]
): Promise<void> {
  const dirs = new Set<string>();
  for (const item of items) {
    const relative = item.basedir.replace(/^\/+/, "");
    const parts = relative.split("/").filter(Boolean);
    for (let index = 1; index <= parts.length; index++) {
      dirs.add(parts.slice(0, index).join("/") + "/");
    }
  }

  const ordered = [...dirs].sort(
    (a, b) =>
      a.split("/").length - b.split("/").length || a.localeCompare(b)
  );
  for (const dir of ordered) {
    await fetch(`/webdav/${encodeKey(dir.replace(/\/$/, ""))}`, {
      method: "MKCOL",
    }).catch(() => undefined);
  }
}
