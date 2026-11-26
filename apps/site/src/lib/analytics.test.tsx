import { afterEach, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { initClickTracking } from "./analytics";

const renderTracked = (html: string) => {
  const capture = vi.fn<(event: string, properties?: Record<string, string>) => void>();
  globalThis.posthog = { capture, register: () => {} };
  document.body.innerHTML = html;
  return capture;
};

afterEach(() => {
  delete globalThis.posthog;
  document.body.replaceChildren();
});

it("captures the nearest annotated ancestor of the click target, and nothing else", async () => {
  const capture = renderTracked(
    `<a href="#top">Home</a><a data-ph-event="social_click" data-ph-prop="social" data-ph-value="github"><svg data-testid="glyph" width="16" height="16"></svg></a>`
  );
  initClickTracking();

  await userEvent.click(page.getByRole("link", { name: "Home" }));
  await userEvent.click(page.getByTestId("glyph"));

  expect(capture.mock.calls).toEqual([["social_click", { social: "github" }]]);
});

it("attaches one listener however many times it is called", async () => {
  const capture = renderTracked(`<button data-ph-event="resume_download">Resume</button>`);
  initClickTracking();
  initClickTracking();

  await userEvent.click(page.getByRole("button", { name: "Resume" }));

  expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
});

it("drops a click property whose value is blank", async () => {
  const capture = renderTracked(
    `<button data-ph-event="resume_download" data-ph-prop="x" data-ph-value=" ">Resume</button>`
  );
  initClickTracking();

  await userEvent.click(page.getByRole("button", { name: "Resume" }));

  expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
});
