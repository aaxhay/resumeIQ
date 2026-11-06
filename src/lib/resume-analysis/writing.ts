import type { AnalysisContext, AnalysisRule, FindingDetails, ResumeFinding, TextBlock } from "./contracts.ts";
import { makeFinding, wordCount } from "./evidence.ts";
import { bulletContent } from "./parse.ts";

const suggestion = (rule_id: string, title: string, description: string, recommendation: string): FindingDetails => ({
  rule_id, category: "writing", kind: "suggestion", severity: "info", confidence: "medium",
  title, description, recommendation,
});

// Restrict repetition to narrative phrases, rather than recurring technology names.
const NARRATIVE_START = /^(?:worked|working|helped|helping|responsible|assisted|assisting|collaborated|collaborating|managed|managing|developed|developing|created|creating|built|building|led|leading|provided|providing|delivered|delivering|supported|supporting)$/u;
const CONNECTIVE = /^(?:a|an|the|to|for|with|on|in|of|and|across)$/u;
const TECHNICAL_PHRASE = /\b(?:continuous integration|continuous delivery|continuous deployment|machine learning|artificial intelligence|natural language processing|user interfaces?|application programming interfaces?|structured query language|sql|api|apis|ui|aws|azure|react|kubernetes)\b/u;

/** At least three distinct bullets; 3–6 contiguous words; one representative per non-overlapping group. */
export const repeatedPhrases: AnalysisRule = (context) => {
  const groups = new Map<string, Set<number>>();
  context.bullets.forEach((bullet, index) => {
    // Punctuation terminates a phrase; whitespace (including wrapped lines) does not.
    for (const segment of bulletContent(bullet).toLowerCase().split(/[^\p{L}\p{N}\s'’_-]+/u)) {
      const words = segment.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) ?? [];
      for (let start = 0; start < words.length; start++) {
        if (!NARRATIVE_START.test(words[start] ?? "")) continue;
        for (let length = 3; length <= 6 && start + length <= words.length; length++) {
          const tokens = words.slice(start, start + length);
          const phrase = tokens.join(" ");
          // Look ahead two words so a candidate cannot truncate a three-word technical term.
          const technicalContext = words.slice(start, start + length + 2).join(" ");
          if (!tokens.some((token) => CONNECTIVE.test(token)) || TECHNICAL_PHRASE.test(technicalContext)) continue;
          const occurrences = groups.get(phrase) ?? new Set<number>();
          occurrences.add(index);
          groups.set(phrase, occurrences);
        }
      }
    }
  });
  const candidates = [...groups.entries()].filter(([, occurrences]) => occurrences.size >= 3)
    .sort(([a], [b]) => wordCount(b) - wordCount(a) || (a < b ? -1 : a > b ? 1 : 0));
  const usedBullets = new Set<number>();
  const findings: ResumeFinding[] = [];
  for (const [phrase, occurrences] of candidates) {
    if ([...occurrences].some((index) => usedBullets.has(index))) continue;
    const first = context.bullets[[...occurrences][0] ?? -1];
    if (!first) continue;
    findings.push(makeFinding(context, suggestion(
      "writing.repeated-phrases", "Review a repeated phrase",
      `The normalized phrase “${phrase}” appears in ${occurrences.size} distinct bullets. Overlapping phrase groups are combined using the longest matching phrase, with one representative bullet per group. Repetition may be intentional; this is not a judgment of the work described.`,
      "If these bullets describe different contributions, consider wording that makes each contribution distinct. Keep necessary repeated terminology.",
    ), first, phrase.replaceAll(" ", "-")));
    occurrences.forEach((index) => usedBullets.add(index));
  }
  return findings;
};

function checkBullets(context: AnalysisContext, details: FindingDetails, matches: (text: string) => boolean): ResumeFinding[] {
  return context.bullets.filter((bullet) => matches(bulletContent(bullet)))
    .map((bullet) => makeFinding(context, details, bullet));
}

export const excessiveFiller: AnalysisRule = (context) => checkBullets(context, suggestion(
  "writing.excessive-filler", "Consider trimming filler phrases",
  "This bullet contains at least two recognized filler expressions. They may be useful in context, so this is an editing suggestion rather than an error.",
  "Consider removing expressions such as ‘in order to’ or ‘as a matter of fact’ where the meaning stays the same.",
), (text) => (text.match(/\b(?:in order to|as a matter of fact|for all intents and purposes|at the end of the day|it is worth noting that|basically|actually|very|really)\b/giu)?.length ?? 0) >= 2);

export const veryLongBullets: AnalysisRule = (context) => checkBullets(context, suggestion(
  "writing.very-long-bullets", "Consider shortening a long bullet",
  "This bullet contains more than 45 words. Length alone does not make it unclear, but it may be worth checking for separate ideas.",
  "If helpful, split distinct contributions or remove wording that does not add context. Keep details needed to understand the work.",
), (text) => wordCount(text) > 45);

export const weakOpeningVerbs: AnalysisRule = (context) => checkBullets(context, {
  ...suggestion(
    "writing.weak-opening-verbs", "Consider a more specific opening",
    "This bullet starts with a broad contribution phrase. It may accurately describe your role; the rule cannot determine the extent of your contribution.",
    "If accurate, name what you did more specifically instead of ‘helped’, ‘assisted’, or ‘worked on’. Do not imply ownership you did not have.",
  ), confidence: "low",
}, (text) => /^(?:helped|assisted|participated in|worked on|worked with|was involved in|were involved in)\b/iu.test(text));

function hasFirstPerson(text: string): boolean {
  const unquoted = text.replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|(?<![\p{L}\p{N}])'[^'\n]*'(?![\p{L}\p{N}])/gu, " ")
    .replace(/\b(?:[Oo]ur|[Mm]y) team's?\b|\b(?:[Oo]ur|[Mm]y) team’s?\b/gu, " ");
  // Case-sensitive alternatives deliberately do not interpret the country abbreviation US as “us”.
  return /\b(?:I|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself|[Ww]e|us|[Oo]ur|[Oo]urs|[Oo]urselves)\b/u.test(unquoted);
}

export const firstPersonLanguage: AnalysisRule = (context) => {
  const blocks: TextBlock[] = [...context.bullets, ...context.paragraphs.filter((block) => block.section === "summary")];
  return blocks.sort((a, b) => a.start - b.start).filter((block) => hasFirstPerson(block.text))
    .map((block) => makeFinding(context, {
      ...suggestion(
        "writing.first-person-language", "Review first-person wording",
        "This bullet or summary uses an unquoted first-person pronoun. Personal voice may be intentional, especially in a summary.",
        "If you prefer concise action-led wording, consider removing unnecessary first-person phrasing while preserving who did the work.",
      ), confidence: "low",
    }, block));
};

export const unclearSentenceStructure: AnalysisRule = (context) => checkBullets(context, {
  ...suggestion(
    "writing.conjunction-heavy-bullets", "Review a conjunction-heavy bullet",
    "This bullet exceeds 30 words and contains at least four ‘and’, ‘or’, or ‘but’ tokens. This narrow pattern may indicate several linked ideas; it is not a grammar assessment.",
    "Check whether the linked ideas would be easier to follow as separate bullets. Lists and necessary technical wording may be fine as written.",
  ), confidence: "low",
}, (text) => wordCount(text) > 30 && (text.match(/\b(?:and|or|but)\b/giu)?.length ?? 0) >= 4);

export const WRITING_RULES: AnalysisRule[] = [
  repeatedPhrases, excessiveFiller, veryLongBullets, weakOpeningVerbs, firstPersonLanguage, unclearSentenceStructure,
];
