"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { accountActionSchema } from "@/lib/saved-reviews/contracts";
import type { AccountAccessState } from "./use-account";

export function AccountAccess({ state }: { state: AccountAccessState }) {
  const { account, pending, error, notice, authenticate, refresh } = state;
  const prefix = useId();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = accountActionSchema.safeParse({ action: mode, email, password });
    if (!parsed.success) {
      setValidation("Enter a valid email and password. New accounts need at least 12 password characters; passwords may have up to 128 characters.");
      (parsed.error.issues.some(issue => issue.path[0] === "email") ? emailInput : passwordInput).current?.focus();
      return;
    }
    setValidation("");
    await authenticate(parsed.data);
    setPassword("");
  }
  return <div className="min-w-0 space-y-4" aria-label="Optional account access">
    {pending && <p role="status" className="text-sm text-muted-foreground">Checking account access…</p>}
    {error && <Notice role="alert" tone="error">{error}</Notice>}
    {notice && <Notice role="status" tone="success">{notice}</Notice>}
    {!account && !pending && <Button type="button" variant="outline" onClick={() => void refresh()}>Retry account check</Button>}
    {account && !account.configured && <Notice>Accounts and saving are unavailable on this deployment. No account is needed to review or improve a resume.</Notice>}
    {account?.configured && <>
      {account.historySetupRequired ? <Notice>Saved history requires database setup. The operator must apply the ResumeIQ Supabase migration and configure retention using docs/supabase.md. Turning on the history flag alone does not create the tables. Your review and local draft are unchanged.</Notice> : account.historyUnavailable ? <Notice><p>Saved history is temporarily unavailable. Account access remains available, including sign-out for signed-in accounts. Your review and local draft are unchanged.</p><Button type="button" variant="outline" className="mt-3" disabled={pending} onClick={() => void refresh()}>Retry history availability</Button></Notice> : !account.historyEnabled && <Notice>Saving is unavailable on this deployment. History must be enabled by the operator before summaries can be saved. Reviewing and improving a resume still work without an account.</Notice>}
      {account.user ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <p className="min-w-0 text-sm [overflow-wrap:anywhere]">Signed in as <strong>{account.user.email}</strong></p>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void authenticate({ action: "sign-out" })}>Sign out</Button>
      </div> : <div className="space-y-4 rounded-xl border p-4 sm:p-5">
        <div><h3 className="font-semibold">{mode === "sign-in" ? "Sign in" : "Create an optional account"}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Use email and a password. No account is needed for your first review, and signing in does not save anything automatically.</p></div>
        <form onSubmit={submit} noValidate className="space-y-4" aria-label={mode === "sign-in" ? "Sign in" : "Create account"}>
          <div><label htmlFor={`${prefix}-email`} className="text-sm font-medium">Email</label><input ref={emailInput} id={`${prefix}-email`} className="field-control mt-2 min-h-11 w-full" type="email" autoComplete="email" maxLength={254} required value={email} disabled={pending} onChange={event => setEmail(event.target.value)} aria-describedby={validation ? `${prefix}-validation` : undefined} aria-invalid={Boolean(validation)} /></div>
          <div><label htmlFor={`${prefix}-password`} className="text-sm font-medium">Password</label><input ref={passwordInput} id={`${prefix}-password`} className="field-control mt-2 min-h-11 w-full" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-up" ? 12 : 1} maxLength={128} required value={password} disabled={pending} onChange={event => setPassword(event.target.value)} aria-describedby={`${prefix}-password-help${validation ? ` ${prefix}-validation` : ""}`} aria-invalid={Boolean(validation)} /><p id={`${prefix}-password-help`} className="mt-2 text-xs leading-6 text-muted-foreground">{mode === "sign-up" ? "Use at least 12 characters. Use a unique password, not one from another service." : "Use your account password. Confirm your email first if you just signed up."}</p></div>
          {validation && <Notice id={`${prefix}-validation`} role="alert" tone="error">{validation}</Notice>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>{mode === "sign-in" ? "Sign in" : "Create account"}</Button>
            <Button type="button" variant="ghost" className="whitespace-normal" disabled={pending} onClick={() => { setMode(value => value === "sign-in" ? "sign-up" : "sign-in"); setPassword(""); setValidation(""); }}>{mode === "sign-in" ? "Create an account instead" : "Sign in instead"}</Button>
          </div>
        </form>
      </div>}
    </>}
  </div>;
}
