export { cn } from "cn";

export function formatRepoSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${parseFloat((kb / 1024).toFixed(1))} MB`;
}
