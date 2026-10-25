export interface FileItem {
  key: string;
  size: number;
  uploaded: string;
  httpMetadata: { contentType: string };
  customMetadata?: { thumbnail?: string };
}

export type ViewMode = "auto" | "list" | "grid";
export type SortField = "name" | "modified" | "size" | "type";
export type SortDirection = "asc" | "desc";
export type FileAction =
  | "open"
  | "download"
  | "share"
  | "edit"
  | "rename"
  | "copy"
  | "cut"
  | "delete"
  | "details"
  | "copyPath";

export interface SortState {
  field: SortField;
  direction: SortDirection;
  foldersFirst: boolean;
}

export interface ShareLink {
  url: string;
  path: string;
  expiresAt: string | null;
}

export interface TransferTask {
  id: string;
  type: "upload" | "download";
  status: "pending" | "in-progress" | "completed" | "failed";
  remoteKey: string;
  file?: File;
  name: string;
  loaded: number;
  total: number;
  error?: Error;
}

export function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function isDirectory(file: FileItem): boolean {
  return file.httpMetadata?.contentType === "application/x-directory";
}

export function fileName(key: string): string {
  return key.replace(/\/$/, "").split("/").pop() || key;
}
