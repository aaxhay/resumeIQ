import { describe, expect, it } from "vitest";
import type { AiReview } from "@/lib/ai-review/contracts";
import {
  MAX_EDIT_TEXT, MAX_ORIGINAL_TEXT, improvementSessionSchema,
  type ImprovementResult, type ImprovementSession,
} from "@/lib/resume-improvement/contracts";
import {
  acceptSuggestion, applicability, chooseTarget, createImprovementSession, editSuggestion,
  findTargets, isSafeAiRewrite, rejectSuggestion, replaceAiSuggestion, restoreOriginal, undoLatestEdit,
} from "@/lib/resume-improvement/editor";
import { validAiReview } from "../fixtures/ai-review";

type Finding = AiReview["findings"][number];
function finding(id: string, original: string, revised: string | null = null): Finding {
  return {
    id, area: "experience", impact: "medium", issue: "Consider a shorter statement.",
    whyItMatters: "Keep the contribution clear.", recommendation: "Review the wording before applying.",
    resumeEvidence: [original], suggestedRewrite: revised === null ? null : { original, revised },
  };
}
function review(findings: Finding[], evidence = findings[0]?.resumeEvidence[0] ?? "Synthetic evidence"): AiReview {
  const data = validAiReview();
  data.priorities = data.priorities.map(item => ({ ...item, resumeEvidence: [evidence] }));
  data.strengths = data.strengths.map(item => ({ ...item, resumeEvidence: [evidence] }));
  data.findings = findings;
  return data;
}
function createDraftSession(original = "Built tools.\nWrote guides.\nTested systems.", findings = [finding("tools", "Built tools.", "tools."), finding("guides", "Wrote guides.", "guides."), finding("tests", "Tested systems.", "systems.")], preview = original) {
  // Most patch-mechanics fixtures deliberately use user-authored shortening, not an AI
  // factual-equivalence claim. Safety tests below exercise unmodified engine creation.
  let state = createImprovementSession(original, review(findings), preview);
  for (const item of findings) {
    if (item.suggestedRewrite && state.suggestions.find(suggestion => suggestion.id === item.id)?.safetyNote) {
      state = success(editSuggestion(state, item.id, item.suggestedRewrite.revised));
    }
  }
  return state;
}
function success(result: ImprovementResult): ImprovementSession {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
function accept(state: ImprovementSession, id: string) {
  return success(acceptSuggestion(state, id, state.revision));
}

describe("controlled resume editing", () => {
  it("caps repetitive targets and blocks every selection and acceptance when enumeration overflows", () => {
    const original = "x".repeat(MAX_ORIGINAL_TEXT);
    const findings = Array.from({ length: 12 }, (_, index) => finding(`repeat-${index}`, "x"));
    const state = createImprovementSession(original, review(findings), "x");
    expect(findTargets(original, "x")).toHaveLength(200);
    for (const suggestion of state.suggestions) {
      expect(suggestion.targets).toHaveLength(200);
      expect(suggestion.targetLimitExceeded).toBe(true);
      expect(suggestion.target).toBeNull();
      expect(applicability(state, suggestion.id).reason).toContain("more than 200");
      expect(chooseTarget(state, suggestion.id, 0).ok).toBe(false);
      expect(acceptSuggestion(state, suggestion.id, state.revision).ok).toBe(false);
    }
    const exactLimit = createImprovementSession("x".repeat(200), review([finding("limit", "x")]), "x");
    expect(exactLimit.suggestions[0]?.targetLimitExceeded).toBe(false);
    expect(chooseTarget(exactLimit, "limit", 199).ok).toBe(true);
  });

  it("rejects forged pending AI text even when the proposed shortening is extractive", () => {
    const original = "Did not lead migration";
    const state = createImprovementSession(original, review([finding("source", original)]), original);
    for (const hasAiRewrite of [true, false]) {
      const forged = { ...state, suggestions: state.suggestions.map(item => ({ ...item, suggestedText: "lead migration", hasAiRewrite })) };
      expect(applicability(forged, "source").canAccept).toBe(false);
      expect(acceptSuggestion(forged, "source", forged.revision).ok).toBe(false);
      expect(editSuggestion(forged, "source", "A replacement").ok).toBe(false);
    }
  });

  it("checks accepted AI provenance while allowing an explicitly manual accepted patch", () => {
    const original = "Did not lead migration";
    const initial = createImprovementSession(original, review([finding("source", original)]), original);
    const manual = success(editSuggestion(initial, "source", "lead migration"));
    const accepted = accept(manual, "source");
    expect(restoreOriginal(accepted).ok).toBe(true);
    const forged = { ...accepted, history: accepted.history.map(patch => ({ ...patch, previousSuggestion: { ...patch.previousSuggestion, status: "pending" as const, hasAiRewrite: true } })) };
    expect(restoreOriginal(forged).ok).toBe(false);
    expect(undoLatestEdit(forged).ok).toBe(false);
  });

  it("preserves rejected manual drafts and still allows unrelated edit, accept, undo and restore", () => {
    let state = success(editSuggestion(createDraftSession(), "guides", "A wholly local user-authored draft."));
    state = success(rejectSuggestion(state, "guides"));
    state = success(editSuggestion(state, "tests", "User-authored systems."));
    state = accept(state, "tools");
    state = success(undoLatestEdit(state));
    state = success(restoreOriginal(state));
    expect(state.suggestions[1]).toMatchObject({ status: "rejected", suggestedText: "A wholly local user-authored draft." });
  });

  it.each([
    ["Successfully Built tools.", "Built tools."],
    ["successfully Built tools.", "Built tools."],
    ["  - Successfully Built tools.  ", "Built tools."],
    ["• Built tools.", "Built tools."],
    ["  Built tools.  ", "Built tools."],
  ])("allows only conservative prefix/formatting removal from %j", (original, revised) => {
    expect(isSafeAiRewrite(original, revised)).toBe(true);
    const state = createImprovementSession(original, review([finding("safe", original, revised)]), original);
    expect(state.suggestions[0]).toMatchObject({ status: "pending", suggestedText: revised, hasAiRewrite: true, safetyNote: null });
    expect(state.modifiedText).toBe(original);
    expect(state.revision).toBe(0);
    expect(accept(state, "safe").modifiedText).toBe(revised);
  });

  it.each([
    ["- 20% variance", "20% variance"],
    ["- $500 variance", "$500 variance"],
    ["Successfully\nBuilt tools.", "Built tools."],
    ["Raised efficiency 35%", "Raised efficiency"],
    ["Did not lead migration", "lead migration"],
    ["Assistant Engineering Manager", "Engineering Manager"],
    ["2019–2021: Managed deployments", "Managed deployments"],
    ["Helped team deliver a tool", "deliver a tool"],
    ["Successfully observed a pilot", "a pilot"],
    ["Successfully increased output by 20%", "increased output"],
    ["Maintained service without outages", "Maintained service"],
  ])("withholds unsafe AI removal of facts or context from %j", (original, revised) => {
    expect(isSafeAiRewrite(original, revised)).toBe(false);
    let state = createImprovementSession(original, review([finding("unsafe", original, revised)]), original);
    expect(state.suggestions[0]).toMatchObject({ status: "pending", suggestedText: original, hasAiRewrite: false, safetyNote: expect.stringContaining("withheld") });
    expect(applicability(state, "unsafe").canAccept).toBe(false);
    expect(acceptSuggestion(state, "unsafe", state.revision).ok).toBe(false);
    state = success(editSuggestion(state, "unsafe", revised));
    expect(state.suggestions[0]?.status).toBe("manually_edited");
    expect(accept(state, "unsafe").modifiedText).toBe(revised);
  });

  it("also withholds unsafe external AI shortening, preserving the original editable starting point", () => {
    const original = "Did not lead migration";
    let state = createImprovementSession(original, review([finding("unsafe", original)]), original);
    state = success(replaceAiSuggestion(state, "unsafe", { original, revised: "lead migration" }, state.revision));
    expect(state.suggestions[0]).toMatchObject({ suggestedText: original, hasAiRewrite: false, safetyNote: expect.stringContaining("withheld"), status: "pending" });
    expect(state.history).toEqual([]);
    expect(state.modifiedText).toBe(original);
  });

  it("keeps immutable original separate from evidence-backed local drafts", () => {
    const state = createDraftSession();
    expect(state.originalText).toBe(state.modifiedText);
    expect(state.revision).toBe(3);
    expect(state.history).toEqual([]);
    expect(state.suggestions[0]).toMatchObject({ id: "tools", findingId: "tools", status: "manually_edited", originalText: "Built tools.", suggestedText: "tools.", hasAiRewrite: false, evidence: { quote: "Built tools.", previewStart: 0, previewEnd: 12 }, target: { start: 0, end: 12, line: 1 } });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.suggestions)).toBe(true);
    expect(Object.isFrozen(state.suggestions[0]?.evidence)).toBe(true);
    expect(Object.isFrozen(state.suggestions[0]?.targets)).toBe(true);
    const snapshot = JSON.stringify(state);
    const next = accept(state, "tools");
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(next.originalText).toBe(state.originalText);
    expect(next.modifiedText).toBe("tools.\nWrote guides.\nTested systems.");
  });

  it("uses ORIGINAL offsets even when minimized preview removed a long contact header", () => {
    const original = "synthetic@example.invalid\nBuilt tools.";
    const preview = "[email removed]\nBuilt tools.";
    const state = createDraftSession(original, [finding("tools", "Built tools.", "tools.")], preview);
    expect(state.suggestions[0]?.evidence.previewStart).toBe(preview.indexOf("Built"));
    expect(state.suggestions[0]?.target?.start).toBe(original.indexOf("Built"));
    expect(accept(state, "tools").modifiedText).toBe("synthetic@example.invalid\ntools.");
  });

  it("uses first evidence for a no-rewrite finding, labels it, and blocks no-op acceptance", () => {
    let state = createDraftSession("Built tools. Wrote guides.", [{ ...finding("tools", "Built tools."), resumeEvidence: ["Built tools.", "Wrote guides."] }]);
    expect(state.suggestions[0]).toMatchObject({ originalText: "Built tools.", suggestedText: "Built tools.", hasAiRewrite: false });
    expect(applicability(state, "tools")).toMatchObject({ canAccept: false, reason: expect.stringContaining("no change") });
    expect(acceptSuggestion(state, "tools", 0).ok).toBe(false);
    state = success(editSuggestion(state, "tools", "Built user-confirmed local tools."));
    expect(state.suggestions[0]?.status).toBe("manually_edited");
    expect(state.modifiedText).toBe(state.originalText);
    expect(accept(state, "tools").modifiedText).toBe("Built user-confirmed local tools. Wrote guides.");
  });

  it("transparently skips no-evidence findings without inventing a source", () => {
    const noEvidence = { ...finding("missing", ""), resumeEvidence: [] };
    const state = createImprovementSession("Synthetic evidence", review([noEvidence]), "Synthetic evidence");
    expect(state.suggestions).toEqual([]);
    expect(state.skippedFindings).toEqual([{ findingId: "missing", reason: expect.stringContaining("No resume evidence") }]);
  });

  it("rejects mismatched preview evidence, uncited rewrites and duplicate finding IDs", () => {
    expect(() => createDraftSession("Built tools.", [finding("tools", "Built tools.", "tools.")], "Different sent preview")).toThrow();
    const uncited = { ...finding("tools", "Built tools."), suggestedRewrite: { original: "Other source", revised: "source" } };
    expect(() => createDraftSession("Built tools. Other source", [uncited])).toThrow();
    expect(() => createDraftSession("Built tools.", [finding("tools", "Built tools."), finding("tools", "Built tools.")])).toThrow();
  });

  it("keeps missing or redacted source visible but blocked rather than trusting preview offsets", () => {
    const missing = createDraftSession("Built original tools.", [finding("tools", "Built preview tools.", "tools.")], "Built preview tools.");
    expect(missing.suggestions[0]?.targets).toEqual([]);
    expect(applicability(missing, "tools").canAccept).toBe(false);
    expect(chooseTarget(missing, "tools", 0).ok).toBe(false);
    expect(acceptSuggestion(missing, "tools", missing.revision).ok).toBe(false);
    const redacted = createDraftSession("Contact synthetic@example.invalid", [finding("contact", "[email removed]", "email")], "Contact [email removed]");
    expect(redacted.suggestions[0]?.target).toBeNull();
    expect(applicability(redacted, "contact").reason).toContain("redacted");
    expect(findTargets("[email removed]", "[email removed]")).toEqual([]);
  });

  it("enumerates duplicate original occurrences even if preview contains only one", () => {
    const original = "EXPERIENCE\nBuilt tools.\nPROJECTS\nBuilt tools.";
    let state = createDraftSession(original, [finding("tools", "Built tools.", "tools.")], "Built tools.");
    const suggestion = state.suggestions[0]!;
    expect(suggestion.target).toBeNull();
    expect(suggestion.targets.map(target => ({ start: target.start, end: target.end, line: target.line }))).toEqual([{ start: 11, end: 23, line: 2 }, { start: 33, end: 45, line: 4 }]);
    expect(suggestion.targets.every(target => target.context.includes("Built tools."))).toBe(true);
    expect(applicability(state, "tools").reason).toContain("Choose");
    expect(acceptSuggestion(state, "tools", 0).ok).toBe(false);
    expect(chooseTarget(state, "tools", 12).ok).toBe(false);
    state = success(chooseTarget(state, "tools", 33));
    expect(accept(state, "tools").modifiedText).toBe("EXPERIENCE\nBuilt tools.\nPROJECTS\ntools.");
  });

  it("supports two explicit identical occurrences without replacing all occurrences", () => {
    let state = createDraftSession("Built tools. Built tools. Built tools.", [finding("first", "Built tools.", "tools."), finding("second", "Built tools.", "Built")]);
    state = success(chooseTarget(state, "first", 0));
    state = accept(state, "first");
    state = success(chooseTarget(state, "second", 13));
    state = accept(state, "second");
    expect(state.modifiedText).toBe("tools. Built Built tools.");
  });

  it("uses UTF-16 offsets and one-based lines without normalizing original Unicode or CRLF", () => {
    const original = "😀 résumé\r\nBuilt café tools.\r\n👩‍💻 Built café tools.";
    const targets = findTargets(original, "Built café tools.");
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({ start: original.indexOf("Built"), end: original.indexOf("Built") + "Built café tools.".length, line: 2 });
    expect(targets[1]?.line).toBe(3);
    let state = createDraftSession(original, [finding("tools", "Built café tools.", "café tools.")]);
    state = success(chooseTarget(state, "tools", targets[1]!.start));
    expect(accept(state, "tools").modifiedText).toBe("😀 résumé\r\nBuilt café tools.\r\n👩‍💻 café tools.");
    expect(findTargets("a\rb", "b")[0]?.line).toBe(2);
    expect(findTargets("aaaa", "aa").map(target => target.start)).toEqual([0, 1, 2]);
  });

  it.each([["tools", "guides", "tests"], ["tests", "guides", "tools"], ["guides", "tools", "tests"]])("keeps original anchors stable for variable-length edits ordered %j, %j, %j", (...order) => {
    let state = createDraftSession();
    state = success(editSuggestion(state, "tools", "Built substantially longer synthetic local tools."));
    state = success(editSuggestion(state, "tests", "T."));
    for (const id of order) state = accept(state, id);
    expect(state.modifiedText).toBe("Built substantially longer synthetic local tools.\nguides.\nT.");
    expect(state.history).toHaveLength(3);
    expect(state.originalText).toBe("Built tools.\nWrote guides.\nTested systems.");
    state = success(undoLatestEdit(state));
    expect(state.history).toHaveLength(2);
    state = accept(state, order[2]!);
    expect(state.modifiedText).toBe("Built substantially longer synthetic local tools.\nguides.\nT.");
  });

  it("allows adjacent edits in the same section, but blocks partial and contained overlap", () => {
    let state = createDraftSession("Built tools.", [finding("whole", "Built tools.", "tools."), finding("left", "Built ", "Built"), finding("right", "tools.", "tools"), finding("partial", "t tools", "tools")]);
    state = accept(state, "left");
    expect(applicability(state, "whole").reason).toContain("overlaps");
    expect(applicability(state, "partial").reason).toContain("overlaps");
    expect(acceptSuggestion(state, "whole", state.revision).ok).toBe(false);
    state = accept(state, "right");
    expect(state.modifiedText).toBe("Builttools");
    state = success(undoLatestEdit(state));
    state = success(undoLatestEdit(state));
    expect(applicability(state, "whole").canAccept).toBe(true);
    expect(accept(state, "whole").modifiedText).toBe("tools.");
  });

  it("reject is terminal, never applies edits, and cannot silently remove accepted patches", () => {
    let state = createDraftSession();
    state = success(rejectSuggestion(state, "guides"));
    expect(state.modifiedText).toBe(state.originalText);
    expect(state.suggestions[1]?.status).toBe("rejected");
    expect(editSuggestion(state, "guides", "New text").ok).toBe(false);
    expect(chooseTarget(state, "guides", 13).ok).toBe(false);
    expect(replaceAiSuggestion(state, "guides", { original: "Wrote guides.", revised: "guides." }, state.revision).ok).toBe(false);
    expect(acceptSuggestion(state, "guides", state.revision).ok).toBe(false);
    state = accept(state, "tools");
    const snapshot = JSON.stringify(state);
    expect(rejectSuggestion(state, "tools").ok).toBe(false);
    expect(editSuggestion(state, "tools", "changed").ok).toBe(false);
    expect(chooseTarget(state, "tools", 0).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.history).toHaveLength(1);
  });

  it("undo restores the pre-accept manual draft but preserves subsequent rejection and manual actions", () => {
    let state = success(editSuggestion(createDraftSession(), "tools", "My local tools."));
    state = accept(state, "tools");
    state = success(rejectSuggestion(state, "guides"));
    state = success(editSuggestion(state, "tests", "My local tests."));
    const previousRevision = state.revision;
    state = success(undoLatestEdit(state));
    expect(state.originalText).toBe(state.modifiedText);
    expect(state.suggestions.map(item => [item.id, item.status, item.suggestedText])).toEqual([
      ["tools", "manually_edited", "My local tools."], ["guides", "rejected", "guides."], ["tests", "manually_edited", "My local tests."],
    ]);
    expect(state.revision).toBe(previousRevision + 1);
    expect(state.history).toEqual([]);
    expect(undoLatestEdit(state).ok).toBe(false);
    expect(applicability(state, "tools").canAccept).toBe(true);
  });

  it("undo removes only the latest acceptance and preserves earlier accepted patches", () => {
    let state = accept(accept(createDraftSession(), "tools"), "guides");
    state = success(undoLatestEdit(state));
    expect(state.modifiedText).toBe("tools.\nWrote guides.\nTested systems.");
    expect(state.suggestions[0]?.status).toBe("accepted");
    expect(state.suggestions[1]?.status).toBe("manually_edited");
    expect(state.history.map(patch => patch.suggestionId)).toEqual(["tools"]);
  });

  it("restore removes all accepted patches/history, restores their draft statuses, and preserves rejection", () => {
    let state = success(editSuggestion(createDraftSession(), "tools", "My local tools."));
    state = accept(accept(state, "tools"), "tests");
    state = success(rejectSuggestion(state, "guides"));
    state = success(restoreOriginal(state));
    expect(state.modifiedText).toBe(state.originalText);
    expect(state.history).toEqual([]);
    expect(state.suggestions.map(item => item.status)).toEqual(["manually_edited", "rejected", "manually_edited"]);
    expect(state.suggestions[0]?.suggestedText).toBe("My local tools.");
    expect(undoLatestEdit(state).ok).toBe(false);
    expect(success(restoreOriginal(state)).revision).toBe(state.revision + 1);
  });

  it("requires current revision and optionally exact current text for acceptance", () => {
    let state = createDraftSession();
    const revision = state.revision;
    state = success(editSuggestion(state, "guides", "A local guide."));
    expect(acceptSuggestion(state, "tools", revision).ok).toBe(false);
    expect(acceptSuggestion(state, "tools", state.revision, "tools.").ok).toBe(false);
    expect(acceptSuggestion(state, "tools", state.revision, "Built tools.").ok).toBe(true);
    expect(acceptSuggestion(state, "tools", Number.NaN).ok).toBe(false);
  });

  it("receives validated AI rewrites as pending drafts without autoaccepting or overwriting manual text", () => {
    let state = createDraftSession("Successfully Built tools.", [finding("tools", "Successfully Built tools.")]);
    state = success(replaceAiSuggestion(state, "tools", { original: "Successfully Built tools.", revised: "Built tools." }, state.revision));
    expect(state.suggestions[0]).toMatchObject({ status: "pending", suggestedText: "Built tools.", hasAiRewrite: true, safetyNote: null });
    expect(state.modifiedText).toBe(state.originalText);
    expect(state.history).toEqual([]);
    const staleRevision = state.revision;
    state = success(editSuggestion(state, "tools", "A user-authored claim, not validated by the model."));
    expect(replaceAiSuggestion(state, "tools", { original: "Built tools.", revised: "Built" }, staleRevision).ok).toBe(false);
    expect(replaceAiSuggestion(state, "tools", { original: "Built tools.", revised: "Built" }, state.revision).ok).toBe(false);
    expect(state.suggestions[0]?.suggestedText).toBe("A user-authored claim, not validated by the model.");
  });

  it("rejects stale callbacks after target changes, rejection, acceptance, undo and restore", () => {
    let state = createDraftSession("Built tools. Built tools.", [finding("tools", "Built tools.", "tools.")]);
    const originalRevision = state.revision;
    state = success(chooseTarget(state, "tools", 0));
    expect(replaceAiSuggestion(state, "tools", { original: "Built tools.", revised: "Built" }, originalRevision).ok).toBe(false);
    const chosenRevision = state.revision;
    state = accept(state, "tools");
    expect(replaceAiSuggestion(state, "tools", { original: "Built tools.", revised: "Built" }, chosenRevision).ok).toBe(false);
    const acceptedRevision = state.revision;
    state = success(undoLatestEdit(state));
    expect(acceptSuggestion(state, "tools", acceptedRevision).ok).toBe(false);
    const undoRevision = state.revision;
    state = success(restoreOriginal(state));
    expect(acceptSuggestion(state, "tools", undoRevision).ok).toBe(false);
    const restoreRevision = state.revision;
    state = success(rejectSuggestion(state, "tools"));
    expect(replaceAiSuggestion(state, "tools", { original: "Built tools.", revised: "Built" }, restoreRevision).ok).toBe(false);
  });

  it("rejects AI source mismatches and non-extractive inventions, and does not accept AI no-ops", () => {
    const state = createDraftSession("Built tools.", [finding("tools", "Built tools.")]);
    for (const rewrite of [{ original: "tools.", revised: "tools" }, { original: "Built tools.", revised: "Invented achievements." }, { original: "Built tools.", revised: " " }]) {
      expect(replaceAiSuggestion(state, "tools", rewrite, state.revision).ok).toBe(false);
    }
    const noOp = success(replaceAiSuggestion(state, "tools", { original: "Built tools.", revised: "Built tools." }, state.revision));
    expect(acceptSuggestion(noOp, "tools", noOp.revision).ok).toBe(false);
  });

  it("enforces source, preview, edit, suggestion and active history bounds", () => {
    const quote = "Built tools.";
    const findings = [finding("tools", quote, "tools.")];
    expect(() => createDraftSession(quote + "x".repeat(MAX_ORIGINAL_TEXT - quote.length), findings, quote)).not.toThrow();
    expect(() => createDraftSession(quote + "x".repeat(MAX_ORIGINAL_TEXT), findings, quote)).toThrow();
    expect(() => createDraftSession(quote, findings, quote + "x".repeat(30_000))).toThrow();
    expect(() => createDraftSession("", findings, quote)).toThrow();
    const state = createDraftSession();
    expect(editSuggestion(state, "tools", "x".repeat(MAX_EDIT_TEXT)).ok).toBe(true);
    expect(editSuggestion(state, "tools", "x".repeat(MAX_EDIT_TEXT + 1)).ok).toBe(false);
    expect(editSuggestion(state, "tools", " ").ok).toBe(false);
    const twelve = Array.from({ length: 12 }, (_, index) => finding(`item-${index}`, `Item ${index} text.`, `Item ${index}`));
    let full = createDraftSession(twelve.map(item => item.resumeEvidence[0]).join("\n"), twelve);
    for (const item of twelve) full = accept(full, item.id);
    expect(full.history).toHaveLength(12);
    expect(improvementSessionSchema.safeParse({ ...full, history: [...full.history, full.history[0]] }).success).toBe(false);
    expect(() => createDraftSession(full.originalText, [...twelve, finding("extra", "Item 0 text.")])).toThrow();
    expect(findTargets("x".repeat(MAX_ORIGINAL_TEXT + 1), "x")).toEqual([]);
    expect(findTargets("text", "")).toEqual([]);
  });

  it("returns fixed errors for unknown IDs and altered current or original slices without mutation", () => {
    const state = createDraftSession();
    expect(acceptSuggestion(state, "unknown", state.revision)).toEqual({ ok: false, error: "Suggestion not found." });
    expect(editSuggestion(state, "unknown", "text").ok).toBe(false);
    expect(rejectSuggestion(state, "unknown").ok).toBe(false);
    expect(applicability(state, "unknown").canAccept).toBe(false);
    const changedCurrent = { ...state, modifiedText: "Sensitive unexpected text" };
    const result = acceptSuggestion(changedCurrent, "tools", 0);
    expect(result).toEqual({ ok: false, error: "The editing session is invalid. Start a new session." });
    expect(JSON.stringify(result)).not.toContain("Sensitive");
    const changedOriginal = { ...state, originalText: "Changed tools.\nWrote guides.\nTested systems.", modifiedText: "Changed tools.\nWrote guides.\nTested systems." };
    expect(acceptSuggestion(changedOriginal, "tools", 0).ok).toBe(false);
    expect(improvementSessionSchema.safeParse({ ...state, extra: true }).success).toBe(false);
    const accepted = accept(state, "tools");
    const changedPatch = { ...accepted, history: accepted.history.map(patch => ({ ...patch, originalText: "Other tools." })) };
    expect(undoLatestEdit(changedPatch).ok).toBe(false);
  });
});
