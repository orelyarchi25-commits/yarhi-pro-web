"use client";

import { useEffect, useState } from "react";

/**
 * מחרוזת query מה-URL (?view=...) בלי useSearchParams של Next –
 * כך נמנעת תקיעת Suspense על מסך "טוען…".
 */
const subscribers = new Set<() => void>();
let patched = false;

function notify() {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

function ensureHistoryPatched() {
  if (typeof window === "undefined" || patched) return;
  patched = true;
  const h = window.history;
  const origPush = h.pushState.bind(h);
  const origReplace = h.replaceState.bind(h);
  h.pushState = (...args: Parameters<History["pushState"]>) => {
    origPush(...args);
    queueMicrotask(notify);
  };
  h.replaceState = (...args: Parameters<History["replaceState"]>) => {
    origReplace(...args);
    queueMicrotask(notify);
  };
  window.addEventListener("popstate", notify);
}

export function useSearchString(): string {
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? window.location.search : ""
  );

  useEffect(() => {
    ensureHistoryPatched();
    const cb = () => setSearch(window.location.search);
    subscribers.add(cb);
    cb();
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  return search;
}
