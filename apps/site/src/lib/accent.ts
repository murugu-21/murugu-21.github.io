interface AccentedTitle {
  before: string;
  accent: string;
  after: string;
}

export function accentTitle(title: string): AccentedTitle {
  const words = title.trim().split(/\s+/);
  const idx = words.findLastIndex(word => /\p{L}/u.test(word));
  if (idx === -1) return { before: words.join(" "), accent: "", after: "" };
  return {
    before: words
      .slice(0, idx)
      .map(word => `${word} `)
      .join(""),
    accent: words[idx],
    after: words
      .slice(idx + 1)
      .map(word => ` ${word}`)
      .join("")
  };
}
