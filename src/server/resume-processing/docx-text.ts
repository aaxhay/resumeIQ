import "server-only";

import { Parser } from "htmlparser2";
import { MAX_RESUME_CHARACTERS } from "../../lib/resume/limits.ts";
import { ResumeProcessingError } from "./errors.ts";

const BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "blockquote"]);
const IGNORED = new Set(["script", "style", "template", "iframe", "object", "noscript"]);

/** Consume converter HTML as data only; no HTML leaves the server extractor.
 * Report omitted link destinations without exposing or appending their values. */
export function docxHtmlToText(html: string, onLinkDestination?: () => void): string {
  let text = "";
  let ignoredDepth = 0;
  let listItemDepth = 0;
  let cellDepth = 0;
  const lists: { ordered: boolean; next: number }[] = [];
  function append(value: string): void {
    // Allow the at-most-two pending paragraph separators that trim() removes.
    if (text.length + value.length > MAX_RESUME_CHARACTERS + 2) {
      throw new ResumeProcessingError("RESOURCE_LIMIT", "The extracted DOCX text exceeds 80,000 characters. Use a shorter resume, or paste a shorter version instead.");
    }
    text += value;
  }
  function boundary(lines: number): void {
    text = text.replace(/[ \t]+$/u, "");
    if (!text) return;
    const existing = /\n*$/u.exec(text)?.[0].length ?? 0;
    if (existing < lines) append("\n".repeat(lines - existing));
  }
  const parser = new Parser({
    onopentag(name, attributes) {
      if (ignoredDepth || IGNORED.has(name)) { ignoredDepth++; return; }
      if (name === "a" && attributes.href?.trim() && !attributes.href.trim().startsWith("#")) onLinkDestination?.();
      if (name === "ul" || name === "ol") {
        boundary(1);
        const start = Number(attributes.start ?? 1);
        lists.push({ ordered: name === "ol", next: Number.isSafeInteger(start) && start > 0 ? start : 1 });
      } else if (name === "li") {
        boundary(1);
        const list = lists.at(-1);
        append(list?.ordered ? `${list.next++}. ` : "• ");
        listItemDepth++;
      } else if (name === "td" || name === "th") {
        cellDepth++;
      } else if (name === "tr" || name === "br") {
        boundary(1);
      } else if (BLOCKS.has(name) && !listItemDepth && !cellDepth) {
        boundary(2);
      }
    },
    ontext(value) {
      if (ignoredDepth) return;
      let normalized = value.replace(/\s+/gu, " ");
      if (!text || /[\s]$/u.test(text)) normalized = normalized.replace(/^ /u, "");
      append(normalized);
    },
    onclosetag(name) {
      if (ignoredDepth) { ignoredDepth--; return; }
      if (name === "ul" || name === "ol") {
        lists.pop();
        boundary(1);
      } else if (name === "li") {
        listItemDepth--;
        boundary(1);
      } else if (name === "td" || name === "th") {
        cellDepth--;
        text = text.trimEnd();
        append("\t");
      } else if (name === "tr") {
        boundary(1);
      } else if (BLOCKS.has(name)) {
        if (cellDepth) {
          if (text && !/\s$/u.test(text)) append(" ");
        } else boundary(listItemDepth ? 1 : 2);
      }
    },
  }, { decodeEntities: true });
  parser.end(html);
  const plainText = text.trim();
  if (plainText.length > MAX_RESUME_CHARACTERS) {
    throw new ResumeProcessingError("RESOURCE_LIMIT", "The extracted DOCX text exceeds 80,000 characters. Use a shorter resume, or paste a shorter version instead.");
  }
  return plainText;
}
