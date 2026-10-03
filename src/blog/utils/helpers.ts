export function formatReadingTime(minutes: number): string {
  const cups = Math.round(minutes / 5);
  if (cups > 5) {
    return `${Array.from({ length: Math.round(cups / Math.E) }, () => "🍱").join("")} ${minutes} min read`;
  }
  return `${Array.from({ length: cups || 1 }, () => "☕️").join("")} ${minutes} min read`;
}

// Hex SHA-256 via Web Crypto, so it runs in the browser, the build and the
// Workers test pool alike.
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
