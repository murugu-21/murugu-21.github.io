// Shared WCAG contrast maths for the palette guards (palette.test.ts and
// islands.test.ts). Test-only — nothing in the app imports this.
export const channels = (c: string): number[] => {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`not a 6-digit hex colour: ${c}`);
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
};

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = (c: string): number => {
  const [r, g, b] = channels(c).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
