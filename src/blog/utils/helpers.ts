export function formatReadingTime(minutes: number): string {
  const cups = Math.round(minutes / 5);
  if (cups > 5) {
    return `${Array.from({ length: Math.round(cups / Math.E) }, () => "🍱").join("")} ${minutes} min read`;
  }
  return `${Array.from({ length: cups || 1 }, () => "☕️").join("")} ${minutes} min read`;
}
