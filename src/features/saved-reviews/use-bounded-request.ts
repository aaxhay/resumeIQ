"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** One bounded request at a time. Cancelled/unmounted responses cannot publish state. */
export function useBoundedRequest(initialPending = false) {
  const active = useRef<{ controller: AbortController; timeout: ReturnType<typeof setTimeout> } | null>(null);
  const [pending, setPending] = useState(initialPending);
  const dispose = useCallback(() => {
    if (active.current) {
      clearTimeout(active.current.timeout);
      active.current.controller.abort();
      active.current = null;
    }
  }, []);
  useEffect(() => dispose, [dispose]);
  const cancel = useCallback((publishPending = true) => { dispose(); if (publishPending) setPending(false); }, [dispose]);
  const start = useCallback((publishPending = true) => {
    if (active.current) return null;
    const controller = new AbortController();
    active.current = { controller, timeout: setTimeout(() => controller.abort(), 20_000) };
    if (publishPending) setPending(true);
    return controller;
  }, []);
  const current = useCallback((controller: AbortController) => active.current?.controller === controller, []);
  const finish = useCallback((controller: AbortController) => {
    if (active.current?.controller !== controller) return;
    clearTimeout(active.current.timeout);
    active.current = null;
    setPending(false);
  }, []);
  return { pending, start, current, finish, cancel };
}
