import type { AnalysisContext, AnalysisRule, FindingDetails, TextBlock } from "./contracts.ts";
import { makeFinding, wordCount } from "./evidence.ts";
import { bulletContent } from "./parse.ts";

function achievementBullets(context: AnalysisContext): TextBlock[] {
  return context.bullets.filter((bullet) => bullet.section === undefined || bullet.section === "experience" || bullet.section === "projects");
}

const suggestion = (rule_id: string, title: string, description: string, recommendation: string): FindingDetails => ({
  rule_id, category: "achievement", kind: "suggestion", severity: "info", confidence: "low",
  title, description, recommendation,
});

const RESPONSIBILITY_OPENING = /^(?:responsible for|responsibilities included?|duties included?|tasked with|in charge of|accountable for)\b/iu;
// Explicit qualitative outcomes and completed deliverables count; numbers are never required.
const OUTCOME_CUE = /\b(?:enabled?|enabling|improved?|improving|improvement|reduced?|reducing|reduction|increased?|increasing|increase|decreased?|decreasing|saved?|saving|prevented?|preventing|resolved?|resolving|eliminated?|eliminating|accelerated?|accelerating|streamlined?|streamlining|delivered|launched|published|released|completed|built|created|implemented|migrated|automated|documented|shipped|established|restored|recovered|result(?:ed|ing)? in|led to|so that|allow(?:ed|ing)?|ensur(?:ed|ing)|made it possible|made available)\b/iu;

/** Only very short phrases composed entirely of explicitly vague words qualify. */
function isShortVague(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? [];
  return wordCount(text) <= 6 && words.length >= 2
    && /^(?:helped|assisted|worked|handled|supported|performed|responsible|participated)\b/iu.test(text)
    && words.every((word) => /^(?:helped|assisted|worked|handled|supported|performed|responsible|participated|on|with|in|for|the|a|an|and|various|some|general|daily|tasks?|duties|work|projects?|activities|team|teams|stuff|things)$/u.test(word));
}

export const responsibilityOnlyWording: AnalysisRule = (context) => achievementBullets(context)
  .filter((bullet) => {
    const text = bulletContent(bullet);
    return RESPONSIBILITY_OPENING.test(text) && !OUTCOME_CUE.test(text) && !isShortVague(text);
  }).map((bullet) => makeFinding(context, suggestion(
    "achievement.responsibility-only", "Consider adding the result of this responsibility",
    "This bullet opens with responsibility wording and has no recognized explicit outcome cue. That does not mean the work lacked an outcome; the text-only check may miss one.",
    "If relevant and accurate, explain what the work enabled or what you delivered. A concrete qualitative result is useful; numbers are not required. Keep responsibility wording when it best describes your role.",
  ), bullet));

export const vagueAchievementContext: AnalysisRule = (context) => achievementBullets(context)
  .filter((bullet) => isShortVague(bulletContent(bullet)))
  .map((bullet) => makeFinding(context, suggestion(
    "achievement.vague-context", "Consider adding concrete context",
    "This bullet has at most six words and uses only broad task or contribution terms. It may be sufficient in context; this rule cannot infer omitted details.",
    "If useful, specify the task, deliverable, audience, or what the work enabled using only facts you can confirm. A short, concrete description is enough; numbers are not required.",
  ), bullet));

const OPENING_VERB = /^(?:built|created|developed|designed|delivered|implemented|led|managed|supported|helped|assisted|worked|responsible|maintained|improved|reduced|launched|tested|wrote|analyzed|coordinated|provided|automated|documented|resolved)$/u;

export const repetitiveBulletOpenings: AnalysisRule = (context) => {
  const groups = new Map<string, TextBlock[]>();
  for (const bullet of achievementBullets(context)) {
    const opening = bulletContent(bullet).match(/^[\p{L}]+/u)?.[0].toLowerCase();
    if (!opening || !OPENING_VERB.test(opening)) continue;
    const group = groups.get(opening) ?? [];
    group.push(bullet);
    groups.set(opening, group);
  }
  return [...groups.entries()].filter(([, bullets]) => bullets.length >= 3).flatMap(([opening, bullets]) => {
    const first = bullets[0];
    return first ? [makeFinding(context, suggestion(
      "achievement.repetitive-openings", "Review repeated bullet openings",
      `${bullets.length} eligible bullets start with “${opening}”. One representative bullet is shown for this opening. Consistent wording may be appropriate; repetition alone is not an error.`,
      "Where contributions differ, consider an accurate opening that distinguishes them. Do not substitute stronger verbs that misrepresent your role.",
    ), first, opening)] : [];
  });
};

export const ACHIEVEMENT_RULES: AnalysisRule[] = [responsibilityOnlyWording, vagueAchievementContext, repetitiveBulletOpenings];
