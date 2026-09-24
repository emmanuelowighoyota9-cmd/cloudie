import { useEffect, useSyncExternalStore } from "react";

/**
 * Unsaved-edit registry.
 *
 * Catalog and pricing edits live in page-local state until an admin saves
 * them, so "unpublished changes" has no server row to count. Each page
 * publishes its own draft count here and the admin sidebar subscribes, which
 * keeps the badge live without persisting half-finished edits to the database.
 *
 * Counts are cleared when a page unmounts: leaving the page discards the
 * drafts, so a stale badge would be a lie.
 */

export type PendingScope = "catalog" | "pricing";

const counts: Record<PendingScope, number> = { catalog: 0, pricing: 0 };
const listeners = new Set<() => void>();

export function setPendingChanges(scope: PendingScope, count: number) {
  const next = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (counts[scope] === next) return;
  counts[scope] = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live count of unpublished changes published by `scope`. */
export function usePendingChanges(scope: PendingScope): number {
  return useSyncExternalStore(
    subscribe,
    () => counts[scope],
    () => counts[scope],
  );
}

/** Publish this page's draft count while it is mounted. */
export function usePublishPendingChanges(scope: PendingScope, count: number) {
  useEffect(() => {
    setPendingChanges(scope, count);
    return () => setPendingChanges(scope, 0);
  }, [scope, count]);
}
