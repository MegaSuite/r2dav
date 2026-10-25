import { useCallback, useEffect, useState } from "react";

export function normalizeCwd(value: string): string {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed + "/";
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHash(hash: string): string {
  const raw = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (!raw) return "";
  const segments = raw
    .split("/")
    .filter(Boolean)
    .map(decodeSegment)
    .filter((segment) => segment !== "." && segment !== "..");
  return segments.length ? segments.join("/") + "/" : "";
}

function hashForCwd(cwd: string): string {
  const normalized = normalizeCwd(cwd);
  if (!normalized) return "#/";
  return (
    "#/" +
    normalized
      .replace(/\/$/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/")
  );
}

export function useHashPath(): [string, (next: string) => void] {
  const [cwd, setCwd] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", hashForCwd(cwd));
    }
    const onHashChange = () => setCwd(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [cwd]);

  const navigate = useCallback((next: string) => {
    const normalized = normalizeCwd(next);
    const hash = hashForCwd(normalized);
    if (window.location.hash === hash) {
      setCwd(normalized);
    } else {
      window.location.hash = hash;
    }
  }, []);

  return [cwd, navigate];
}
