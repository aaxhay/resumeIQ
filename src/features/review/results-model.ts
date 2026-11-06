import type { AiReview } from "@/lib/ai-review/contracts";
import type { JobComparison } from "@/lib/job-description/analysis-contracts";

type Finding = AiReview["findings"][number];
type Area = Finding["area"];

export const FINDING_GROUPS = [
  { id: "content", title: "Content", areas: ["summary", "experience", "projects"] },
  { id: "writing", title: "Writing and grammar", areas: ["clarity", "grammar", "repetition"] },
  { id: "structure", title: "Structure and formatting", areas: ["structure", "readability"] },
  { id: "impact", title: "Achievements and impact", areas: ["achievements"] },
  { id: "skills", title: "Skills", areas: ["skills"] },
] as const satisfies ReadonlyArray<{ id: string; title: string; areas: readonly Area[] }>;

export const COMPARISON_STATUS_LABELS = {
  supported: "Supported",
  partially_supported: "Partially supported",
  not_evidenced: "Not evidenced",
  not_assessed: "Not assessed",
} satisfies Record<JobComparison["status"], string>;

export const JOB_CATEGORY_LABELS = {
  required_skill: "Required skills",
  preferred_skill: "Preferred skills",
  experience: "Experience",
  qualification: "Education and certifications / qualifications",
  responsibility: "Responsibilities",
  technical_requirement: "Technical requirements",
} satisfies Record<JobComparison["category"], string>;

export type ComparisonFilter = "all" | JobComparison["status"];
export const COMPARISON_FILTERS: readonly ComparisonFilter[] = [
  "all", "supported", "partially_supported", "not_evidenced", "not_assessed",
];

/** Presentation only: retain every finding, its order, and the supplied AI judgment. */
export function groupFindings(findings: AiReview["findings"]) {
  return FINDING_GROUPS.map((group) => ({
    ...group,
    findings: findings.filter((finding) => (group.areas as readonly Area[]).includes(finding.area)),
  }));
}

/** Filtering never assesses evidence, changes statuses, or merges requirements. */
export function groupComparisons(comparisons: JobComparison[], filter: ComparisonFilter = "all") {
  return (Object.keys(JOB_CATEGORY_LABELS) as JobComparison["category"][]).map((category) => ({
    category,
    title: JOB_CATEGORY_LABELS[category],
    comparisons: comparisons.filter((item) => item.category === category && (filter === "all" || item.status === filter)),
  }));
}
