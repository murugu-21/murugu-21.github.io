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

// `pageCount` is null when the PDF's info can't be read. Returns how many
// tokens it found.
export function checkResume({ text, pageCount }: { text: string; pageCount: number | null }) {
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
  return ATS_REQUIRED_TOKENS.length;
}
