import { useEffect, useState } from "react";

const STORAGE_KEY = "drover:composer-drafts:v1";

function readDrafts(): Record<string, string> {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function useScopedDraft(scopeKey: string) {
  const [drafts, setDrafts] = useState<Record<string, string>>(readDrafts);
  const draft = drafts[scopeKey] ?? "";

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // A blocked storage surface still keeps drafts safely scoped for this mount.
    }
  }, [drafts]);

  const setDraft = (value: string | ((current: string) => string)) => {
    setDrafts((current) => {
      const next = typeof value === "function" ? value(current[scopeKey] ?? "") : value;
      if (!next) {
        const rest = { ...current };
        delete rest[scopeKey];
        return rest;
      }
      return { ...current, [scopeKey]: next };
    });
  };

  return [draft, setDraft] as const;
}
