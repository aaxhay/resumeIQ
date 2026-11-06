"use client";

import { useCallback, useEffect, useState } from "react";
import { accountActionResponseSchema, accountActionSchema, accountSchema } from "@/lib/saved-reviews/contracts";
import { accountRequest, requestError } from "./api";
import { useBoundedRequest } from "./use-bounded-request";

type Account = ReturnType<typeof accountSchema.parse>;
type Action = ReturnType<typeof accountActionSchema.parse>;

/** Mount only on /account or after the optional save panel is opened. */
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { pending, start, current, finish, cancel } = useBoundedRequest(true);
  const check = useCallback((controller: AbortController) =>
    accountRequest("/api/account", accountSchema, controller.signal)
      .then(result => { if (current(controller)) setAccount(result); })
      .catch((failure: unknown) => { if (current(controller)) setError(requestError(failure)); })
      .finally(() => finish(controller)), [current, finish]);
  const refresh = useCallback(async () => {
    const controller = start();
    if (!controller) return;
    setError(""); setNotice("");
    // Fail closed: a refresh never leaves old private history visible.
    setAccount(null);
    await check(controller);
  }, [start, check]);
  useEffect(() => {
    const controller = start(false);
    if (controller) void check(controller);
    return () => cancel(false);
  }, [check, start, cancel]);
  useEffect(() => {
    // Recheck when returning from another tab; never poll or retain stale private UI.
    const revalidate = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [refresh]);
  const expire = useCallback((message?: string) => {
    cancel();
    setAccount(value => value ? { ...value, user: null } : null);
    setNotice("");
    setError(message ?? "Your session has expired. Private history has been cleared from this page. Sign in again to continue.");
  }, [cancel]);
  async function authenticate(action: Action) {
    const parsed = accountActionSchema.safeParse(action);
    if (!parsed.success) { setError("Enter a valid email and password. New accounts need at least 12 password characters."); return; }
    const controller = start();
    if (!controller) return;
    setError(""); setNotice("");
    // Clear private UI immediately, including if sign-out later fails.
    setAccount(value => value ? { ...value, user: null } : null);
    try {
      const result = await accountRequest("/api/account", accountActionResponseSchema, controller.signal, "POST", parsed.data);
      if (!current(controller)) return;
      if (action.action === "sign-out") {
        setNotice("Signed out. Private history has been cleared from this page.");
      } else if (result.confirmationRequired) {
        setNotice("Check your email to confirm your account, then sign in here. Your review and local draft stay on this page.");
      } else {
        const latest = await accountRequest("/api/account", accountSchema, controller.signal);
        if (current(controller)) {
          setAccount(latest);
          setNotice(latest.user ? "Signed in. Saving is still optional and requires your consent." : "Sign in to continue. You may need to confirm your email first.");
        }
      }
    } catch (failure) {
      if (current(controller)) {
        if (action.action === "sign-out") {
          setAccount(null);
          setError("Sign-out could not be confirmed. Private history is hidden here, but your session may still be active. Retry the account check, then sign out again.");
        } else setError(requestError(failure));
      }
    } finally { finish(controller); }
  }
  return { account, error, notice, pending, refresh, authenticate, expire };
}
export type AccountAccessState = ReturnType<typeof useAccount>;
