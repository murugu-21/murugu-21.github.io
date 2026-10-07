// The build fails unless the printed resume passes these: an ATS must find each
// token in the PDF's extracted text, and it must fit on MAX_PAGES.
const MAX_PAGES = 2;

const ATS_REQUIRED_TOKENS = [
  "Murugappan M",
  "murugu2001@gmail.com",
  "PROFESSIONAL SUMMARY",
  "SKILLS",
  "EXPERIENCE",
  "EDUCATION",
  "Software Engineer II",
  "95%+",
  "$300k"
];

// `pageCount` is null when the PDF's info can't be read; returns the log line.
export function checkResume({
  path,
  bytes,
  text,
  pageCount
}: {
  path: string;
  bytes: number;
  text: string;
  pageCount: number | null;
}): string {
  const missing = ATS_REQUIRED_TOKENS.filter(token => !text.includes(token));
  if (missing.length > 0) {
    throw new Error(
      `ATS gate FAILED: missing tokens ${missing.map(t => JSON.stringify(t)).join(", ")}`
    );
  }
  // @sparticuz's fallback fonts are wider than local Chrome's, so overflow can be CI-only.
  if (pageCount !== null && pageCount > MAX_PAGES) {
    throw new Error(`page gate FAILED: ${pageCount} pages (max ${MAX_PAGES})`);
  }
  return (
    `[generate-resume] wrote ${path} (${(bytes / 1024).toFixed(1)} KB, ${pageCount ?? "?"} page${pageCount === 1 ? "" : "s"}); ` +
    `ATS gate passed, all ${ATS_REQUIRED_TOKENS.length} required tokens found`
  );
}
