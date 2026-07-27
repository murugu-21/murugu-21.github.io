// The reference styles one word of every section heading in the accent color
// ("My Recent Works", "Professional Skillset"). This wraps the last
// letter-bearing word of a title in <span class="accent">, skipping trailing
// emoji like "🛠️". Titles come from portfolio.ts but are escaped anyway.

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function accentTitle(title: string): string {
  const words = title.trim().split(/\s+/);
  let idx = -1;
  for (let i = words.length - 1; i >= 0; i--) {
    if (/\p{L}/u.test(words[i])) {
      idx = i;
      break;
    }
  }
  return words
    .map((w, i) =>
      i === idx ? `<span class="accent">${escapeHtml(w)}</span>` : escapeHtml(w)
    )
    .join(" ");
}
