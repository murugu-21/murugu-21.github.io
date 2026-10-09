import { afterEach, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ActivityRow } from "./ActivityRow.tsx";

afterEach(() => {
  vi.useRealTimers();
});

it("shows the elapsed seconds only once the wait passes three seconds", async () => {
  vi.useFakeTimers();
  const screen = await render(<ActivityRow activity={{ name: "capture_opportunity" }} />);
  await vi.advanceTimersByTimeAsync(2000);
  expect(screen.container.textContent).toBe("Noting your details…Jarvis is typing");
  await vi.advanceTimersByTimeAsync(1000);
  expect(screen.container.textContent).toBe("Noting your details…3sJarvis is typing");
});
