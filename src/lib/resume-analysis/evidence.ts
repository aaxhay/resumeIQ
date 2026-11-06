import type { AnalysisContext, FindingDetails, ResumeFinding, TextSpan } from "./contracts.ts";

export function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function makeFinding(context: AnalysisContext, details: FindingDetails, span?: TextSpan, suffix = ""): ResumeFinding {
  return {
    ...details,
    id: `${details.rule_id}:${span ? `${span.start}-${span.end}` : "document"}${suffix ? `:${suffix}` : ""}`,
    evidence_text: span ? context.text.slice(span.start, span.end) : "",
    ...(span ? { evidence_location: { start_line: span.startLine, end_line: span.endLine, start_offset: span.start, end_offset: span.end } } : {}),
    detection_source: "deterministic",
  };
}

export function spanAcross(first: TextSpan, last: TextSpan): TextSpan {
  return { start: first.start, end: last.end, startLine: first.startLine, endLine: last.endLine };
}
