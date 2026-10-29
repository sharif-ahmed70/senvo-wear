"use client";

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/*
 * Page drafts: what someone typed on a page is kept for the browser tab, so
 * going Back (or to another page and back again) brings it back instead of
 * an empty form. Only plain JSON values are kept (no Set, Map or File).
 * After a successful save the page calls clearPageDraft(), so a saved entry
 * is never filled in again.
 */

const PREFIX = "senvo:draft:";

/** The page a draft belongs to: path plus query (an Edit page per product). */
export function currentPageKey(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function storageKey(page: string, key: string): string {
  return `${PREFIX}${page}::${key}`;
}

/** A kept value as it was stored, or undefined. */
export function readPageDraft<T>(
  key: string,
  page = currentPageKey(),
): T | undefined {
  try {
    const raw = window.sessionStorage.getItem(storageKey(page, key));
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

// Pages whose draft was just cleared: nothing is written for them again
// until the page is opened anew or resumePageDraft() is called.
const paused = new Set<string>();

// The page whose form was filled from a draft (shows the notice).
let restoredPage: string | null = null;
const listeners = new Set<() => void>();

function setRestoredPage(page: string | null) {
  if (restoredPage === page) return;
  restoredPage = page;
  for (const listener of listeners) listener();
}

/** Page key whose form was refilled from a draft, or null. */
export function useRestoredDraftPage(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => restoredPage,
    () => null,
  );
}

/** Forget everything typed on a page (default: the current page). */
export function clearPageDraft(page = currentPageKey()): void {
  paused.add(page);
  if (restoredPage === page) setRestoredPage(null);
  try {
    const prefix = `${PREFIX}${page}::`;
    for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was kept either.
  }
}

/** Forget every page's draft (signing out: the next person starts clean). */
export function clearAllPageDrafts(): void {
  setRestoredPage(null);
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index--) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was kept either.
  }
}

/** Start keeping drafts again after clearPageDraft (a new entry begins). */
export function resumePageDraft(page = currentPageKey()): void {
  paused.delete(page);
}

/**
 * useState that survives leaving the page and coming back in the same tab.
 * `key` must be unique on the page. `restore` can reject or adjust a kept
 * value (for example a finished step); return undefined to use `initial`.
 */
export function usePageDraft<T>(
  key: string,
  initial: T | (() => T),
  restore?: (kept: T) => T | undefined,
): [T, Dispatch<SetStateAction<T>>] {
  const [start] = useState(() => {
    const page = currentPageKey();
    // Opening the page again starts keeping drafts again.
    paused.delete(page);
    const kept = page ? readPageDraft<T>(key, page) : undefined;
    const adjusted = kept !== undefined && restore ? restore(kept) : kept;
    return adjusted === undefined
      ? {
          page,
          restored: false,
          value:
            typeof initial === "function" ? (initial as () => T)() : initial,
        }
      : { page, restored: true, value: adjusted };
  });
  const [value, setValue] = useState<T>(start.value);
  const { page } = start;

  useEffect(() => {
    if (start.restored && start.page) setRestoredPage(start.page);
  }, [start]);

  const firstWrite = useRef(true);
  useEffect(() => {
    // The first value is either the draft itself or the untouched default.
    if (firstWrite.current) {
      firstWrite.current = false;
      return;
    }
    if (!page || paused.has(page)) return;
    try {
      window.sessionStorage.setItem(
        storageKey(page, key),
        JSON.stringify(value),
      );
    } catch {
      // Full or blocked storage: the form still works, just is not kept.
    }
  }, [key, page, value]);

  return [value, setValue];
}
