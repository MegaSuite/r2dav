import { friendlyType } from "./mime";
import { isDirectory, type FileItem, type SortState } from "./types";

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function compareName(a: FileItem, b: FileItem): number {
  return collator.compare(a.key, b.key);
}

export function sortFiles(files: FileItem[], sort: SortState): FileItem[] {
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...files].sort((a, b) => {
    if (sort.foldersFirst) {
      const aDir = isDirectory(a);
      const bDir = isDirectory(b);
      if (aDir !== bDir) return aDir ? -1 : 1;
    }

    let result = 0;
    switch (sort.field) {
      case "modified":
        result = Date.parse(a.uploaded) - Date.parse(b.uploaded);
        break;
      case "size":
        result = a.size - b.size;
        break;
      case "type":
        result = collator.compare(friendlyType(a), friendlyType(b));
        break;
      case "name":
      default:
        result = compareName(a, b);
        break;
    }

    if (result === 0) result = compareName(a, b);
    return result * direction;
  });
}
