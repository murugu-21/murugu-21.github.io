export function formatReadingTime(minutes: number): string {
  let cups = Math.round(minutes / 5);
  if (cups > 5) {
    return `${Array.from({ length: Math.round(cups / Math.E) }, () => "🍱").join("")} ${minutes} min read`;
  } else {
    return `${Array.from({ length: cups || 1 }, () => "☕️").join("")} ${minutes} min read`;
  }
}
