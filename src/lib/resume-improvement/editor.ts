import { z } from "zod";
import { MAX_AI_TEXT, reviewSchema, rewriteSchema, type AiReview, type Rewrite } from "../ai-review/contracts.ts";
import {
  MAX_ACCEPTED_EDITS, MAX_EDIT_TEXT, MAX_ORIGINAL_TEXT, MAX_TARGETS, improvementSessionSchema,
  type AcceptedEdit, type Applicability, type ImprovementResult, type ImprovementSession,
  type ImprovementSuggestion, type ImprovementTarget,
} from "./contracts.ts";

const INVALID = "The editing session is invalid. Start a new session.";
const STALE = "This action is out of date. Review the current suggestion and try again.";
const LOCKED = "Accepted and rejected suggestions cannot be changed. Undo an accepted edit first.";
const NO_TARGET = "The exact original text is missing or redacted. This suggestion cannot be applied.";
const CHOOSE = "Choose an exact occurrence in the original resume before accepting.";
const CONFLICT = "This suggestion overlaps an accepted edit. Undo that edit first.";
const TOO_MANY_TARGETS = "This text occurs more than 200 times in the original. Target selection and acceptance are blocked; use a more specific evidence quote in a new review.";
const NO_CHANGE = "Change the suggested text before accepting; this edit would make no change.";
const REDACTED = /\[(?:email|phone|link) removed\]/iu;
const WITHHELD = "The AI rewrite was withheld because it could remove factual context. The original is an editable starting point; manual changes are user-authored.";

/** A deliberately tiny allowlist, not a general factual-equivalence detector. Only formatting
 * and the optional non-factual leading filler 'Successfully ' may be removed by AI. */
export function isSafeAiRewrite(original: string, revised: string): boolean {
  if (original === revised) return true;
  const trimmed = original.trim();
  // A leading minus followed by a number/currency may be a signed metric, not a bullet.
  // Stay on the same line and require a letter before treating a marker as formatting.
  const unbulleted = trimmed.replace(/^[-*•][ \t]+(?=[A-Za-z])/u, "");
  const allowed = [trimmed, unbulleted, trimmed.replace(/^successfully[ \t]+/iu, ""), unbulleted.replace(/^successfully[ \t]+/iu, "")];
  return revised.trim().length > 0 && allowed.includes(revised);
}
const fail = (error: string): ImprovementResult => ({ ok: false, error });
const editable = (suggestion: ImprovementSuggestion) => suggestion.status === "pending" || suggestion.status === "manually_edited";
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Enumerate exact, possibly overlapping occurrences without fuzzy matching. The public list is
 * bounded to 200; session creation also records overflow and blocks ALL targeting in that case. */
export function findTargets(originalText: string, quote: string): readonly ImprovementTarget[] {
  return scanTargets(originalText, quote).targets;
}

function scanTargets(originalText: string, quote: string): { targets: readonly ImprovementTarget[]; targetLimitExceeded: boolean } {
  const targets: ImprovementTarget[] = [];
  const result = (targetLimitExceeded: boolean) => ({ targets: Object.freeze(targets), targetLimitExceeded });
  if (!originalText || originalText.length > MAX_ORIGINAL_TEXT || !quote.trim() || quote.length > MAX_EDIT_TEXT || REDACTED.test(quote)) return result(false);
  let line = 1;
  let scanned = 0;
  for (let start = originalText.indexOf(quote); start !== -1; start = originalText.indexOf(quote, start + 1)) {
    if (targets.length === MAX_TARGETS) return result(true);
    while (scanned < start) {
      if (originalText[scanned] === "\n" || (originalText[scanned] === "\r" && originalText[scanned + 1] !== "\n")) line++;
      scanned++;
    }
    const end = start + quote.length;
    targets.push(Object.freeze({ start, end, line, context: originalText.slice(Math.max(0, start - 40), Math.min(originalText.length, start + 140)) }));
  }
  return result(false);
}

const creationSchema = z.object({
  originalText: z.string().min(1).max(MAX_ORIGINAL_TEXT).refine(text => text.trim().length > 0),
  review: reviewSchema,
  preview: z.string().min(1).max(MAX_AI_TEXT),
}).strict().superRefine(({ review, preview }, context) => {
  const invalid = () => context.addIssue({ code: "custom", message: "Review evidence does not match the supplied preview." });
  if (new Set(review.findings.map(finding => finding.id)).size !== review.findings.length) invalid();
  for (const item of [...review.priorities, ...review.strengths, ...review.findings, ...review.jobMatches]) {
    if (item.resumeEvidence.some(quote => !quote.trim() || !preview.includes(quote))) invalid();
  }
  for (const finding of review.findings) {
    const rewrite = finding.suggestedRewrite;
    if (rewrite && (!rewrite.revised.trim() || !rewrite.original.includes(rewrite.revised) || !finding.resumeEvidence.some(quote => quote.includes(rewrite.original)))) invalid();
  }
});

/** The caller supplies a validated review and the EXACT minimized text sent for that review.
 * Preview offsets are evidence references only. Anchors are rediscovered in the confirmed original. */
export function createImprovementSession(originalText: string, review: AiReview, preview: string): ImprovementSession {
  const input = creationSchema.parse({ originalText, review, preview });
  const suggestions: ImprovementSuggestion[] = [];
  const skippedFindings: { findingId: string; reason: string }[] = [];
  for (const finding of input.review.findings) {
    const rewrite = finding.suggestedRewrite;
    const quote = rewrite ? finding.resumeEvidence.find(evidence => evidence.includes(rewrite.original)) : finding.resumeEvidence[0];
    if (!quote) {
      skippedFindings.push({ findingId: finding.id, reason: "No resume evidence was supplied; no editable suggestion was created." });
      continue;
    }
    const original = rewrite?.original ?? quote;
    const { targets, targetLimitExceeded } = scanTargets(input.originalText, original);
    const safeRewrite = rewrite !== null && isSafeAiRewrite(original, rewrite.revised);
    const previewStart = input.preview.indexOf(quote);
    suggestions.push({
      id: finding.id, findingId: finding.id, originalText: original,
      suggestedText: safeRewrite ? rewrite!.revised : original,
      reason: `${finding.whyItMatters}\n\n${finding.recommendation}`,
      evidence: { quote, previewStart, previewEnd: previewStart + quote.length },
      status: "pending", hasAiRewrite: safeRewrite, safetyNote: rewrite && !safeRewrite ? WITHHELD : null, targets,
      targetLimitExceeded,
      target: !targetLimitExceeded && targets.length === 1 ? targets[0]! : null,
    });
  }
  return improvementSessionSchema.parse({ originalText: input.originalText, modifiedText: input.originalText, suggestions, history: [], revision: 0, skippedFindings });
}

/** Render active patches from ORIGINAL coordinates; adjacent edits are deliberately legal. */
function render(originalText: string, patches: readonly AcceptedEdit[]): string | null {
  let cursor = 0;
  const parts: string[] = [];
  for (const patch of [...patches].sort((a, b) => a.start - b.start)) {
    if (patch.start < cursor || patch.end <= patch.start || originalText.slice(patch.start, patch.end) !== patch.originalText || patch.originalText === patch.replacementText) return null;
    parts.push(originalText.slice(cursor, patch.start), patch.replacementText);
    cursor = patch.end;
  }
  parts.push(originalText.slice(cursor));
  return parts.join("");
}

function safePendingDraft(suggestion: ImprovementSuggestion): boolean {
  return suggestion.status !== "pending" || (suggestion.hasAiRewrite
    ? isSafeAiRewrite(suggestion.originalText, suggestion.suggestedText)
    : suggestion.originalText === suggestion.suggestedText);
}

/** Runtime checks protect callers from altered snapshots, not just TypeScript consumers. */
function validState(state: ImprovementSession): boolean {
  if (!improvementSessionSchema.safeParse(state).success) return false;
  if (render(state.originalText, state.history) !== state.modifiedText) return false;
  if (new Set(state.suggestions.map(suggestion => suggestion.id)).size !== state.suggestions.length || new Set(state.history.map(patch => patch.suggestionId)).size !== state.history.length) return false;
  for (const suggestion of state.suggestions) {
    if (suggestion.id !== suggestion.findingId || !suggestion.evidence.quote.includes(suggestion.originalText) || !safePendingDraft(suggestion)) return false;
    if (suggestion.targetLimitExceeded && suggestion.target !== null) return false;
    if (suggestion.target && (!suggestion.targets.some(target => target.start === suggestion.target?.start && target.end === suggestion.target.end) || state.originalText.slice(suggestion.target.start, suggestion.target.end) !== suggestion.originalText)) return false;
    const patch = state.history.find(entry => entry.suggestionId === suggestion.id);
    if ((suggestion.status === "accepted") !== Boolean(patch)) return false;
    if (patch && (!suggestion.target || patch.start !== suggestion.target.start || patch.end !== suggestion.target.end || patch.originalText !== suggestion.originalText || patch.replacementText !== suggestion.suggestedText || patch.previousSuggestion.id !== suggestion.id || !editable(patch.previousSuggestion) || !safePendingDraft(patch.previousSuggestion) || patch.previousSuggestion.originalText !== suggestion.originalText || patch.previousSuggestion.suggestedText !== suggestion.suggestedText)) return false;
  }
  return state.history.every(patch => state.suggestions.some(suggestion => suggestion.id === patch.suggestionId));
}

function commit(state: ImprovementSession, suggestions: readonly ImprovementSuggestion[], history = state.history): ImprovementResult {
  const modifiedText = render(state.originalText, history);
  if (modifiedText === null) return fail(INVALID);
  const result = improvementSessionSchema.safeParse({ ...state, suggestions, history, modifiedText, revision: state.revision + 1 });
  return result.success ? { ok: true, state: result.data } : fail(INVALID);
}

function updateSuggestion(state: ImprovementSession, suggestion: ImprovementSuggestion): ImprovementResult {
  return commit(state, state.suggestions.map(item => item.id === suggestion.id ? suggestion : item));
}

function blockedReason(state: ImprovementSession, suggestion: ImprovementSuggestion): string | null {
  if (!editable(suggestion)) return LOCKED;
  if (suggestion.targetLimitExceeded) return TOO_MANY_TARGETS;
  if (!suggestion.targets.length || REDACTED.test(suggestion.originalText)) return NO_TARGET;
  if (!suggestion.target) return CHOOSE;
  if (state.originalText.slice(suggestion.target.start, suggestion.target.end) !== suggestion.originalText) return NO_TARGET;
  if (state.history.some(patch => overlaps(patch, suggestion.target!))) return CONFLICT;
  if (suggestion.suggestedText === suggestion.originalText) return NO_CHANGE;
  if (state.history.length >= MAX_ACCEPTED_EDITS) return "Undo an edit before accepting another suggestion.";
  return null;
}

export function applicability(state: ImprovementSession, id: string): Applicability {
  if (!validState(state)) return { canAccept: false, reason: INVALID };
  const suggestion = state.suggestions.find(item => item.id === id);
  const reason = suggestion ? blockedReason(state, suggestion) : "Suggestion not found.";
  return { canAccept: reason === null, reason };
}

export function chooseTarget(state: ImprovementSession, id: string, start: number): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  const suggestion = state.suggestions.find(item => item.id === id);
  if (!suggestion) return fail("Suggestion not found.");
  if (!editable(suggestion)) return fail(LOCKED);
  if (suggestion.targetLimitExceeded) return fail(TOO_MANY_TARGETS);
  const target = suggestion.targets.find(item => item.start === start);
  if (!target || state.originalText.slice(target.start, target.end) !== suggestion.originalText) return fail(NO_TARGET);
  return updateSuggestion(state, { ...suggestion, target });
}

/** Manual drafts are user-authored local text, not AI-validated factual claims. */
export function editSuggestion(state: ImprovementSession, id: string, text: string): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  const suggestion = state.suggestions.find(item => item.id === id);
  if (!suggestion) return fail("Suggestion not found.");
  if (!editable(suggestion)) return fail(LOCKED);
  if (typeof text !== "string" || !text.trim() || text.length > MAX_EDIT_TEXT) return fail("Enter a non-empty suggestion of at most 2500 characters.");
  return updateSuggestion(state, { ...suggestion, suggestedText: text, status: "manually_edited" });
}

/** expectedText is the current original target text, not the proposed replacement. */
export function acceptSuggestion(state: ImprovementSession, id: string, expectedRevision: number, expectedText?: string): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  if (expectedRevision !== state.revision) return fail(STALE);
  const suggestion = state.suggestions.find(item => item.id === id);
  if (!suggestion) return fail("Suggestion not found.");
  const reason = blockedReason(state, suggestion);
  if (reason) return fail(reason);
  const target = suggestion.target!;
  const shift = state.history.filter(patch => patch.end <= target.start).reduce((sum, patch) => sum + patch.replacementText.length - patch.originalText.length, 0);
  const currentText = state.modifiedText.slice(target.start + shift, target.end + shift);
  if (currentText !== suggestion.originalText || (expectedText !== undefined && expectedText !== currentText)) return fail(STALE);
  const patch: AcceptedEdit = { suggestionId: id, start: target.start, end: target.end, originalText: suggestion.originalText, replacementText: suggestion.suggestedText, previousSuggestion: suggestion };
  return commit(state, state.suggestions.map(item => item.id === id ? { ...item, status: "accepted" } : item), [...state.history, patch]);
}

export function rejectSuggestion(state: ImprovementSession, id: string): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  const suggestion = state.suggestions.find(item => item.id === id);
  if (!suggestion) return fail("Suggestion not found.");
  if (!editable(suggestion)) return fail(LOCKED);
  return updateSuggestion(state, { ...suggestion, status: "rejected" });
}

/** Undo only the latest accepted patch, never a whole-state snapshot. Later local actions survive. */
export function undoLatestEdit(state: ImprovementSession): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  const latest = state.history.at(-1);
  if (!latest) return fail("There are no accepted edits to undo.");
  return commit(state, state.suggestions.map(item => item.id === latest.suggestionId ? latest.previousSuggestion : item), state.history.slice(0, -1));
}

/** Restore accepted suggestions to their pre-accept draft/status; preserve all other drafts and
 * rejections. Remove every active patch/history entry. The immutable original never changes. */
export function restoreOriginal(state: ImprovementSession): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  return commit(state, state.suggestions.map(item => state.history.find(patch => patch.suggestionId === item.id)?.previousSuggestion ?? item), []);
}

/** Receive an already server-validated extractive rewrite; never apply it or overwrite a manual draft. */
export function replaceAiSuggestion(state: ImprovementSession, id: string, rewrite: Rewrite, expectedRevision: number): ImprovementResult {
  if (!validState(state)) return fail(INVALID);
  if (expectedRevision !== state.revision) return fail(STALE);
  const suggestion = state.suggestions.find(item => item.id === id);
  if (!suggestion) return fail("Suggestion not found.");
  if (!editable(suggestion)) return fail(LOCKED);
  if (suggestion.status === "manually_edited") return fail("A manual draft cannot be overwritten by an AI rewrite.");
  const parsed = rewriteSchema.safeParse(rewrite);
  if (!parsed.success || parsed.data.original !== suggestion.originalText || !parsed.data.revised.trim() || !parsed.data.original.includes(parsed.data.revised)) return fail("The rewrite does not match this suggestion's exact source text.");
  const safeRewrite = isSafeAiRewrite(parsed.data.original, parsed.data.revised);
  return updateSuggestion(state, { ...suggestion, suggestedText: safeRewrite ? parsed.data.revised : suggestion.originalText, hasAiRewrite: safeRewrite, safetyNote: safeRewrite ? null : WITHHELD });
}
