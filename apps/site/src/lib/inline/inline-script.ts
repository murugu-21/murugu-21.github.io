export type InlineSyntax = "es5" | "latest";

export interface InlineScript {
  readonly source: string;
  readonly syntax: InlineSyntax;
}

export function inlineScript<Args extends readonly string[]>({
  run,
  args,
  syntax
}: {
  run: (win: never, ...args: Args) => void;
  args: Args;
  syntax: InlineSyntax;
}): InlineScript {
  const passed = ["window", ...args.map(arg => JSON.stringify(arg))].join(", ");
  return { source: `(${run.toString()})(${passed});`, syntax };
}
