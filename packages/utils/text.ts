export const nonEmpty = (value: string | null | undefined): string | undefined =>
  value === "" || value === null ? undefined : value;
