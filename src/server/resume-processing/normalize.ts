import "server-only";

/** Normalize presentation noise, never flatten newlines or join hyphenated words. */
export function normalizeResumeText(input: string): string {
  const ligatures: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl" };
  return input.normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split(String.fromCharCode(8232)).join("\n\n")
    .split(String.fromCharCode(8233)).join("\n\n")
    .replace(/\f/g, "\n\n")
    .replace(/[   ]/g, " ")
    .replace(/[​﻿­]/g, "")
    .replace(/[ﬀﬁﬂﬃﬄ]/g, (character) => ligatures[character] ?? character)
    .split("").filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127 || character === "\t" || character === "\n";
    }).join("")
    .split("\n")
    .map((line) => {
      const expanded = line.replace(/\t/g, "  ").trimEnd();
      if (!expanded.trim()) return "";
      const indentation = Math.min(expanded.length - expanded.trimStart().length, 12);
      return " ".repeat(indentation) + expanded.trimStart().replace(/ {2,}/g, " ").replace(/^[●◦▪‣]\s*/, "• ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
