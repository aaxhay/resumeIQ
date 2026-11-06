import type { AnalysisRule, ResumeFinding } from "./contracts.ts";
import { makeFinding, spanAcross, wordCount } from "./evidence.ts";
import { bulletContent } from "./parse.ts";

export const checkLongParagraphs: AnalysisRule = (context) => context.paragraphs.flatMap((paragraph) => {
  const words = wordCount(paragraph.text);
  if (words <= 100) return [];
  return [makeFinding(context, {
    rule_id: "readability.long-paragraph", category: "readability", severity: "info", kind: "suggestion", confidence: "medium",
    title: "Long block of prose",
    description: `This uninterrupted non-bullet block contains ${words} words, exceeding this rule's 100-word review trigger. Extracted line breaks may not reflect the original layout; this is not an industry limit.`,
    recommendation: "Check the original layout. If this is genuinely one paragraph, consider splitting distinct ideas while preserving necessary context.",
  }, paragraph)];
});

export const checkTextDensity: AnalysisRule = (context) => {
  const findings: ResumeFinding[] = [];
  // Inspect explicit text blocks separated by blank lines; do not claim to see
  // fonts, margins, pages, columns, or the source document's visual density.
  let block: typeof context.lines = [];
  function inspect() {
    const first = block[0]; const last = block.at(-1);
    const words = wordCount(block.map((line) => line.text).join(" "));
    if (first && last && block.length >= 3 && words >= 180) findings.push(makeFinding(context, {
      rule_id: "readability.dense-text-block", category: "readability", severity: "info", kind: "suggestion", confidence: "low",
      title: "Large text block without a blank line",
      description: `${words} words across ${block.length} consecutive nonempty extracted lines. The trigger is at least 180 words across 3 or more lines, not a visual-layout or page-density standard.`,
      recommendation: "Inspect the source document before changing spacing. If ideas are crowded together, consider clearer grouping or paragraph breaks; extraction may have removed those breaks.",
    }, spanAcross(first, last)));
    block = [];
  }
  for (const line of context.lines) {
    if (!line.text.trim()) inspect();
    else block.push(line);
  }
  inspect();
  return findings;
};

export const checkRepeatedWords: AnalysisRule = (context) => {
  const findings: ResumeFinding[] = [];
  for (const line of context.lines) {
    const tokens = [...line.text.matchAll(/[\p{L}]+(?:['’][\p{L}]+)*/gu)];
    let index = 0;
    while (index < tokens.length - 1) {
      const first = tokens[index];
      if (!first) break;
      let last = first;
      let end = index + 1;
      while (end < tokens.length) {
        const next = tokens[end];
        if (!next || first[0].toLowerCase() !== next[0].toLowerCase() || !/^\s+$/u.test(line.text.slice(last.index + last[0].length, next.index))) break;
        last = next; end += 1;
      }
      if (end > index + 1) findings.push(makeFinding(context, {
        rule_id: "readability.repeated-word", category: "readability", severity: "info", kind: "objective", confidence: "high",
        title: "Adjacent word repetition",
        description: `The same word appears ${end - index} times consecutively on this line, ignoring case. This may be intentional phrasing or an extraction artifact; it is not automatically a grammatical error.`,
        recommendation: "Check the original and remove an accidental duplicate only if the intended meaning is preserved.",
      }, { start: line.start + first.index, end: line.start + last.index + last[0].length, startLine: line.number, endLine: line.number }));
      index = end;
    }
  }
  return findings;
};

export const checkBulletFormatting: AnalysisRule = (context) => {
  const findings: ResumeFinding[] = [];
  // Compare only within each recognized section (or the unsectioned preamble).
  const groups = new Map<number, typeof context.bullets>();
  let sectionIndex = -1;
  for (const bullet of context.bullets) {
    while ((context.sections[sectionIndex + 1]?.heading.start ?? Infinity) < bullet.start) sectionIndex += 1;
    const group = groups.get(sectionIndex) ?? [];
    group.push(bullet); groups.set(sectionIndex, group);
  }
  for (const bullets of groups.values()) {
    const first = bullets[0]; const last = bullets.at(-1);
    if (!first || !last || bullets.length < 3) continue;
    const unordered = bullets.filter((bullet) => !/^\d/u.test(bullet.marker ?? ""));
    const markers = new Set(unordered.map((bullet) => bullet.marker));
    if (unordered.length >= 3 && markers.size > 1) findings.push(makeFinding(context, {
      rule_id: "readability.mixed-bullet-markers", category: "readability", severity: "info", kind: "suggestion", confidence: "low",
      title: "Bullet markers vary within a section",
      description: "At least three unordered bullets in this section use more than one marker. This can reflect intentional nesting or text extraction rather than inconsistent source formatting.",
      recommendation: "Compare the original list levels. Use consistent markers for comparable bullets if the difference is unintentional.",
    }, spanAcross(first, last)));
    const endings = bullets.map((bullet) => /[.!?]["'”’)]?$/u.test(bulletContent(bullet)));
    if (endings.includes(true) && endings.includes(false)) findings.push(makeFinding(context, {
      rule_id: "readability.mixed-bullet-punctuation", category: "readability", severity: "info", kind: "suggestion", confidence: "low",
      title: "Bullet ending punctuation varies",
      description: "Some of at least three bullets in this section end with sentence punctuation and others do not. Fragments and full sentences may reasonably use different punctuation.",
      recommendation: "Review comparable bullets for an intentional style. Either approach can be appropriate; do not force punctuation onto labels or links.",
    }, spanAcross(first, last)));
  }
  return findings;
};

export const READABILITY_RULES: AnalysisRule[] = [checkLongParagraphs, checkTextDensity, checkRepeatedWords, checkBulletFormatting];
