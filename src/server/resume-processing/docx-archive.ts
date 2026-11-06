import "server-only";

import { crc32 } from "node:zlib";
import { XMLValidator } from "fast-xml-parser";
import { Parser } from "htmlparser2";
import { fromBufferPromise } from "yauzl";
import {
  MAX_EXPANDED_BYTES, MAX_FILE_BYTES, MAX_XML_BYTES, MAX_ZIP_ENTRIES,
} from "../../lib/resume/limits.ts";
import { ResumeProcessingError } from "./errors.ts";

const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const WORD_NS = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const MAIN_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const RELATIONSHIP_CONTENT_TYPE = "application/vnd.openxmlformats-package.relationships+xml";

type XmlChild = { name: string; namespace: string; attributes: Record<string, string> };
type XmlSummary = { name: string; namespace: string; hasBody: boolean; hasWordText: boolean; children: XmlChild[] };
export type DocxArchiveInspection = { hasHeaderFooterText: boolean };

function malformed(): never {
  throw new ResumeProcessingError("MALFORMED_FILE", "This DOCX is invalid or damaged. Save a fresh DOCX, or paste your resume text instead.");
}

function resourceLimit(): never {
  throw new ResumeProcessingError("RESOURCE_LIMIT", "This DOCX is too complex to process safely. Try a simpler DOCX, or paste your resume text instead.");
}

function protectedFile(): never {
  throw new ResumeProcessingError("PROTECTED_FILE", "Password-protected or encrypted DOCX files are not supported. Upload an unprotected copy, or paste your resume text instead.");
}

function safePartName(name: string, directory = false): string {
  let decoded: string;
  try { decoded = decodeURIComponent(name); } catch { return malformed(); }
  if (directory) decoded = decoded.replace(/\/$/u, "");
  if (!decoded || /[\\:%?#\u0000-\u001f\u007f]/u.test(decoded)
    || decoded.split("/").some((part) => !part || part === "." || part === "..")) malformed();
  return decoded.toLowerCase();
}

function inspectXml(bytes: Buffer, collectChildren: boolean): XmlSummary {
  // Mammoth reads OOXML as UTF-8. Reject invalid encodings rather than let the
  // validator and converter interpret different XML documents.
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/u.test(xml)
    || XMLValidator.validate(xml) !== true) malformed();
  const declaration = /^\s*<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/iu.exec(xml);
  if (declaration && !/^utf-?8$/iu.test(declaration[1] ?? "")) malformed();

  const summary: XmlSummary = { name: "", namespace: "", hasBody: false, hasWordText: false, children: [] };
  const scopes: Map<string, string>[] = [];
  const wordTextElements: boolean[] = [];
  let roots = 0;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (scopes.length >= 256) resourceLimit();
      const scope = new Map(scopes.at(-1));
      for (const [key, value] of Object.entries(attributes)) {
        if (key === "xmlns") scope.set("", value);
        else if (key.startsWith("xmlns:")) scope.set(key.slice(6), value);
      }
      const colon = name.indexOf(":");
      const localName = colon < 0 ? name : name.slice(colon + 1);
      const namespace = scope.get(colon < 0 ? "" : name.slice(0, colon)) ?? "";
      if (scopes.length === 0) {
        if (++roots !== 1) malformed();
        summary.name = localName;
        summary.namespace = namespace;
      } else if (scopes.length === 1) {
        if (localName === "body" && WORD_NS.has(namespace)) summary.hasBody = true;
        if (collectChildren) {
          if (summary.children.length >= 10_000) resourceLimit();
          summary.children.push({ name: localName, namespace, attributes });
        }
      }
      scopes.push(scope);
      wordTextElements.push(localName === "t" && WORD_NS.has(namespace));
    },
    onclosetag() { scopes.pop(); wordTextElements.pop(); },
    ontext(text) {
      if (scopes.length === 0 && text.trim()) malformed();
      if (wordTextElements.at(-1) && text.trim()) summary.hasWordText = true;
    },
  }, { xmlMode: true, decodeEntities: true });
  parser.end(xml);
  if (roots !== 1) malformed();
  return summary;
}

function verifyPackage(names: Set<string>, xmlParts: Map<string, XmlSummary>): void {
  const types = xmlParts.get("[Content_Types].xml");
  const relationships = xmlParts.get("_rels/.rels");
  if (types?.name !== "Types" || types.namespace !== CONTENT_TYPES_NS
    || relationships?.name !== "Relationships" || relationships.namespace !== RELATIONSHIPS_NS) malformed();

  const overrides = new Map<string, string>();
  const defaults = new Map<string, string>();
  for (const child of types.children) {
    const { ContentType, PartName, Extension } = child.attributes;
    if (child.namespace !== CONTENT_TYPES_NS || !ContentType) malformed();
    if (/macroenabled|vba|activex/iu.test(ContentType)) malformed();
    if (child.name === "Override") {
      if (!PartName?.startsWith("/")) malformed();
      const path = PartName.slice(1);
      safePartName(path);
      if (overrides.has(path) || !names.has(path)) malformed();
      overrides.set(path, ContentType);
    } else if (child.name === "Default") {
      if (!Extension || defaults.has(Extension.toLowerCase())) malformed();
      defaults.set(Extension.toLowerCase(), ContentType);
    } else malformed();
  }
  const contentType = (path: string) => overrides.get(path) ?? defaults.get(path.split(".").at(-1)?.toLowerCase() ?? "");
  if (contentType("_rels/.rels") !== RELATIONSHIP_CONTENT_TYPE) malformed();
  for (const name of names) {
    if (name === "[Content_Types].xml") continue;
    const type = contentType(name);
    if (!type) malformed();
    // XML parts with unconventional extensions cannot bypass XML screening.
    if (/(?:\+|\/)xml$/iu.test(type) && !xmlParts.has(name)) malformed();
  }

  const main = relationships.children.filter((child) => child.attributes.Type === MAIN_RELATIONSHIP);
  if (main.length !== 1) malformed();
  const relationship = main[0];
  if (!relationship || relationship.name !== "Relationship" || relationship.namespace !== RELATIONSHIPS_NS
    || (relationship.attributes.TargetMode && relationship.attributes.TargetMode !== "Internal")) malformed();
  const target = relationship.attributes.Target?.replace(/^\//u, "");
  if (!target) malformed();
  safePartName(target);
  if (!names.has(target) || contentType(target) !== MAIN_CONTENT_TYPE) malformed();
  const document = xmlParts.get(target);
  if (document?.name !== "document" || !WORD_NS.has(document.namespace) || !document.hasBody) malformed();

  for (const [path, summary] of xmlParts) {
    if (!path.endsWith(".rels")) continue;
    if (summary.name !== "Relationships" || summary.namespace !== RELATIONSHIPS_NS) malformed();
    const ids = new Set<string>();
    for (const child of summary.children) {
      const { Id, Type, Target } = child.attributes;
      if (child.name !== "Relationship" || child.namespace !== RELATIONSHIPS_NS
        || !Id || !Type || !Target || ids.has(Id) || /vba|macro/iu.test(Type)) malformed();
      ids.add(Id);
      if (/\/(?:officeDocument|comments|endnotes|footnotes|numbering|styles)$/u.test(Type)
        && (!/\.xml$/u.test(Target) || (child.attributes.TargetMode && child.attributes.TargetMode !== "Internal"))) malformed();
    }
  }
}

/** Screen every entry in memory before Mammoth gets access to the archive. */
export async function validateDocxArchive(bytes: Buffer): Promise<DocxArchiveInspection> {
  if (bytes.length > MAX_FILE_BYTES) {
    throw new ResumeProcessingError("FILE_TOO_LARGE", "This DOCX exceeds the upload size limit. Try a smaller file, or paste your resume text instead.");
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) protectedFile();
  try {
    const archive = await fromBufferPromise(bytes, {
      lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true,
    });
    try {
      if (archive.entryCount > MAX_ZIP_ENTRIES) resourceLimit();
      const canonicalNames = new Set<string>();
      const names = new Set<string>();
      const xmlParts = new Map<string, XmlSummary>();
      let entryCount = 0;
      let declaredBytes = 0;
      let expandedBytes = 0;
      for await (const entry of archive.eachEntry()) {
        if (++entryCount > MAX_ZIP_ENTRIES) resourceLimit();
        if (entry.generalPurposeBitFlag & 0x2041) protectedFile();
        const name = entry.fileName;
        const canonical = safePartName(name, name.endsWith("/"));
        if (canonicalNames.has(canonical) || /(?:^|\/)vba[^/]*$|\.(?:vba|docm|dotm)$/iu.test(name)) malformed();
        canonicalNames.add(canonical);
        if (!name.endsWith("/")) names.add(name);
        if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) malformed();
        declaredBytes += entry.uncompressedSize;
        const isXml = /\.(?:xml|rels)$/iu.test(name);
        if (declaredBytes > MAX_EXPANDED_BYTES || (isXml && entry.uncompressedSize > MAX_XML_BYTES)) resourceLimit();
        if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) malformed();
        // Avoid ZIP parser differentials: local headers must describe the same
        // file as the central directory that was screened above.
        const local = await archive.readLocalFileHeaderPromise(entry);
        if (local.generalPurposeBitFlag & 0x2041) protectedFile();
        if (!local.fileName.equals(entry.fileNameRaw)
          || local.compressionMethod !== entry.compressionMethod
          || local.generalPurposeBitFlag !== entry.generalPurposeBitFlag) malformed();
        if (!(entry.generalPurposeBitFlag & 8)
          && (local.uncompressedSize !== entry.uncompressedSize || local.compressedSize !== entry.compressedSize
            || local.crc32 !== entry.crc32)) malformed();
        const stream = await archive.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        let size = 0;
        let checksum = 0;
        try {
          for await (const value of stream) {
            const chunk: unknown = value;
            if (!Buffer.isBuffer(chunk)) malformed();
            size += chunk.length;
            expandedBytes += chunk.length;
            if (expandedBytes > MAX_EXPANDED_BYTES || (isXml && size > MAX_XML_BYTES)) resourceLimit();
            if (size > entry.uncompressedSize) malformed();
            checksum = crc32(chunk, checksum);
            if (isXml) chunks.push(chunk);
          }
        } finally { stream.destroy(); }
        if (size !== entry.uncompressedSize || checksum !== entry.crc32) malformed();
        if (isXml) xmlParts.set(name, inspectXml(Buffer.concat(chunks, size), name === "[Content_Types].xml" || name.endsWith(".rels")));
      }
      if (entryCount !== archive.entryCount) malformed();
      verifyPackage(names, xmlParts);
      return {
        hasHeaderFooterText: [...xmlParts.values()].some(part => WORD_NS.has(part.namespace)
          && (part.name === "hdr" || part.name === "ftr") && part.hasWordText),
      };
    } finally { archive.close(); }
  } catch (error) {
    if (error instanceof ResumeProcessingError) throw error;
    // yauzl rejects strong encryption before yielding the entry to us.
    if (error instanceof Error && error.message === "strong encryption is not supported") protectedFile();
    malformed();
  }
}
