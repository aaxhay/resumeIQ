export const REVIEW_OPTIONS = [
  {
    value: "general",
    title: "General Review",
    description: "Focus on writing, structure, clarity, achievements, skills, and overall resume quality.",
    detail: "No job description needed",
  },
  {
    value: "job-specific",
    title: "Job-Specific Review",
    description: "Focus on your resume’s relevance to a supplied job description and the experience it calls for.",
    detail: "Bring a job description",
  },
] as const;

export type ReviewMode = (typeof REVIEW_OPTIONS)[number]["value"];
