/** Leave multipart overhead below Vercel's 4.5 MB function payload limit. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_LABEL = "4 MB";
export const MAX_RESUME_CHARACTERS = 80_000;
export const MIN_RESUME_CHARACTERS = 40;
export const MIN_RESUME_WORDS = 8;
export const MAX_PDF_PAGES = 20;
export const MAX_ZIP_ENTRIES = 1_000;
export const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
export const MAX_XML_BYTES = 8 * 1024 * 1024;
export const PARSE_TIMEOUT_MS = 15_000;
export const FILE_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
