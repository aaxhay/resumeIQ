import { AREAS, type AiReview } from "../../src/lib/ai-review/contracts.ts";
export const aiResume = "Fictional Example\nSUMMARY\nSoftware developer focused on reliable systems and clear documentation.\nEXPERIENCE\n- Built TypeScript tools for internal documentation.\n- Created a guide that enabled independent onboarding.\nSKILLS\nTypeScript, testing, documentation\nEDUCATION\nExample University, Bachelor of Arts\nPROJECTS\n- Published a synthetic resume parser with automated tests.";
export const aiJob = "Fictional software role. Required: TypeScript and documentation. Preferred: Kubernetes. Responsibilities include maintaining reliable tools and clear guides.";
export const aiQuote = "Built TypeScript tools for internal documentation.";
export function validAiReview(jobSpecific = false): AiReview {
  return {
    assessment: "The supplied text demonstrates documentation work and clear deliverables. This is advisory, not factual verification.",
    priorities: ["Preserve concrete deliverables", "Clarify truthful scope", "Keep relevant skills visible"].map(title => ({ title, recommendation: "Keep the supplied wording, adding context only if true.", resumeEvidence: [aiQuote] })),
    strengths: [{ title: "Concrete deliverable", explanation: "The text names a tool and its purpose.", resumeEvidence: [aiQuote] }],
    areas: AREAS.map(area => ({ area, status: "assessed", explanation: "Reviewed only the supplied text; model judgments may be mistaken." })),
    findings: [{ id: "context", area: "experience", impact: "medium", issue: "The audience could be clearer.", whyItMatters: "Context can help a reader interpret the contribution.", recommendation: "If true, describe who used these tools.", resumeEvidence: [aiQuote], suggestedRewrite: null }],
    jobMatches: jobSpecific ? [
      { category: "required_skill", requirement: "TypeScript", jobEvidence: "Required: TypeScript and documentation.", status: "supported", resumeEvidence: [aiQuote], explanation: "TypeScript appears in a concrete tool-building statement.", recommendation: "Keep the truthful evidence visible." },
      { category: "preferred_skill", requirement: "Kubernetes", jobEvidence: "Preferred: Kubernetes.", status: "not_evidenced", resumeEvidence: [], explanation: "Not evidenced in this text, not proof the person lacks the skill.", recommendation: "Add relevant experience only if true." },
    ] : [],
    limitations: ["Text-only, non-exhaustive review. Exact quotes do not verify factual truth or semantic correctness."],
  };
}
