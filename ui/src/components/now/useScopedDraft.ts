// Per-scope composer memory — draft text, attached images, and file-mention chips — kept in the same
// local presentation memory as workspace sessions (localStorage), so an unsent thought survives Thread
// switches and an app restart. Never venture truth: losing it costs a draft, nothing else.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PendingComposerImage } from "./composerImageFiles";
import type { ComposerFileMention } from "./composerFileMentions";
import { fileMentionTokenFor } from "./composerFileMentions";
import {
  COMPOSER_SOURCE_REFERENCE_EVENT,
  type ComposerSourceReference,
} from "./composerSourceReference";
import type { StagedJourneyAttachment } from "./ComposerJourneyInput";

const STORAGE_KEY = "drover:composer-drafts:v2";
const SESSION_KEY_V1 = "drover:composer-drafts:v1";
// Presentation memory stays bounded: only the most recently touched drafts persist across restarts.
const MAX_SCOPES = 12;
const PERSIST_DEBOUNCE_MS = 250;

type StoredImage = { id: string; name: string; mediaType: string; size: number; data: string };
type StoredDraft = { text: string; files: ComposerFileMention[]; images: StoredImage[]; journeyImport: StagedJourneyAttachment | null; at: number };
type DraftMap = Record<string, StoredDraft>;

function normalizedDraft(value: unknown): StoredDraft | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<StoredDraft>;
  const text = typeof entry.text === "string" ? entry.text : "";
  const files = Array.isArray(entry.files)
    ? entry.files.filter((file): file is ComposerFileMention => Boolean(file && typeof file.path === "string" && typeof file.token === "string"))
    : [];
  const images = Array.isArray(entry.images)
    ? entry.images.filter((image): image is StoredImage => Boolean(
      image && typeof image.id === "string" && typeof image.name === "string"
      && typeof image.mediaType === "string" && typeof image.size === "number" && typeof image.data === "string",
    ))
    : [];
  const journeyImport = entry.journeyImport
    && typeof entry.journeyImport.importRef === "string"
    && typeof entry.journeyImport.name === "string"
    && typeof entry.journeyImport.byteSize === "number"
    ? {
        importRef: entry.journeyImport.importRef,
        name: entry.journeyImport.name,
        byteSize: entry.journeyImport.byteSize,
        ...(typeof entry.journeyImport.rowCount === "number" ? { rowCount: entry.journeyImport.rowCount } : {}),
      }
    : null;
  if (!text && !images.length && !journeyImport) return null;
  return { text, files, images, journeyImport, at: typeof entry.at === "number" ? entry.at : 0 };
}

function readDrafts(): DraftMap {
  const drafts: DraftMap = {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    for (const [scope, value] of Object.entries(stored ?? {})) {
      const entry = normalizedDraft(value);
      if (entry) drafts[scope] = entry;
    }
    // v1 drafts were text-only session memory; carry any not already claimed forward once.
    const legacy = JSON.parse(window.sessionStorage.getItem(SESSION_KEY_V1) ?? "null") as Record<string, unknown> | null;
    for (const [scope, text] of Object.entries(legacy ?? {})) {
      if (!drafts[scope] && typeof text === "string" && text) drafts[scope] = { text, files: [], images: [], journeyImport: null, at: 0 };
    }
  } catch { /* presentation memory is disposable */ }
  return drafts;
}

function persistDrafts(drafts: DraftMap) {
  const entries = Object.entries(drafts).sort((left, right) => right[1].at - left[1].at).slice(0, MAX_SCOPES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota: keep text and chips, drop stored image bytes. In-memory attachments this session still
    // stand; only restart survival for those images is lost.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries.map(([scope, entry]) => [scope, { ...entry, images: [] }]))));
    } catch { /* presentation memory is disposable */ }
  }
}

function persistScope(drafts: DraftMap, scopeKey: string, removeMissing: boolean) {
  const latest = readDrafts();
  const entry = drafts[scopeKey];
  if (entry) latest[scopeKey] = entry;
  else if (removeMissing) delete latest[scopeKey];
  persistDrafts(latest);
}

const EMPTY_DRAFT: StoredDraft = { text: "", files: [], images: [], journeyImport: null, at: 0 };

export function useComposerDraft(scopeKey: string) {
  const [drafts, setDrafts] = useState<DraftMap>(readDrafts);
  const draftsRef = useRef(drafts);
  const scopeRef = useRef(scopeKey);
  const touchedRef = useRef(false);

  // Debounced write-through, flushed on window close and unmount, so a keystroke never pays a full
  // serialization and a restart still finds the draft.
  useEffect(() => {
    draftsRef.current = drafts;
    scopeRef.current = scopeKey;
    const timer = window.setTimeout(() => persistScope(drafts, scopeKey, touchedRef.current), PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [drafts, scopeKey]);
  useEffect(() => () => persistScope(draftsRef.current, scopeKey, touchedRef.current), [scopeKey]);
  useEffect(() => {
    const flush = () => persistScope(draftsRef.current, scopeRef.current, touchedRef.current);
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, []);

  const entry = drafts[scopeKey];
  const patch = useCallback((change: (current: StoredDraft) => Omit<StoredDraft, "at">) => {
    touchedRef.current = true;
    setDrafts((current) => {
      const next = { ...change(current[scopeKey] ?? EMPTY_DRAFT), at: Date.now() };
      if (!next.text && !next.images.length && !next.journeyImport) {
        if (!current[scopeKey]) return current;
        const rest = { ...current };
        delete rest[scopeKey];
        return rest;
      }
      return { ...current, [scopeKey]: next };
    });
  }, [scopeKey]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<ComposerSourceReference>).detail;
      if (!detail || detail.scopeKey !== scopeKey) return;
      patch((current) => {
        const plainToken = fileMentionTokenFor(detail.path, current.files);
        const base = plainToken.replace(/^@/, "");
        const lineLabel = detail.startLine === detail.endLine
          ? `L${detail.startLine}`
          : `L${detail.startLine}–${detail.endLine}`;
        const token = `@${base}:${lineLabel}`;
        const files = [
          ...current.files.filter((file) => !(
            file.path === detail.path
            && file.startLine === detail.startLine
            && file.endLine === detail.endLine
          )),
          {
            path: detail.path,
            token,
            startLine: detail.startLine,
            endLine: detail.endLine,
            sourceRef: detail.ref,
            scopeKey: detail.scopeKey,
          },
        ];
        const spacer = current.text && !/\s$/.test(current.text) ? " " : "";
        const text = `${current.text}${spacer}${token} `;
        return { ...current, text, files };
      });
    };
    window.addEventListener(COMPOSER_SOURCE_REFERENCE_EVENT, receive);
    return () => window.removeEventListener(COMPOSER_SOURCE_REFERENCE_EVENT, receive);
  }, [patch, scopeKey]);

  const images = useMemo<PendingComposerImage[]>(
    () => (entry?.images ?? []).map((image) => ({ ...image, preview: `data:${image.mediaType};base64,${image.data}` })),
    [entry?.images],
  );

  return {
    draft: entry?.text ?? "",
    setDraft: (value: string | ((current: string) => string)) =>
      patch((current) => ({ ...current, text: typeof value === "function" ? value(current.text) : value })),
    images,
    setImages: (value: PendingComposerImage[] | ((current: PendingComposerImage[]) => PendingComposerImage[])) =>
      patch((current) => {
        const hydrated = current.images.map((image) => ({ ...image, preview: `data:${image.mediaType};base64,${image.data}` }));
        const next = typeof value === "function" ? value(hydrated) : value;
        return { ...current, images: next.map(({ id, name, mediaType, size, data }) => ({ id, name, mediaType, size, data })) };
      }),
    fileMentions: entry?.files ?? [],
    setFileMentions: (files: ComposerFileMention[]) => patch((current) => ({ ...current, files })),
    journeyImport: entry?.journeyImport ?? null,
    setJourneyImport: (journeyImport: StagedJourneyAttachment | null) => patch((current) => ({ ...current, journeyImport })),
  };
}
