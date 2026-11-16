import { expect, it, vi } from "vite-plus/test";

it("undoes fake timers and stubbed globals and env vars a previous file left behind", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("leftOver", "from a previous file");
  vi.stubEnv("LEFT_OVER", "from a previous file");

  vi.resetModules();
  await import("./start-fresh.ts");

  expect(vi.isFakeTimers()).toBe(false);
  expect("leftOver" in globalThis).toBe(false);
  expect(import.meta.env.LEFT_OVER).toBe(undefined);
});
