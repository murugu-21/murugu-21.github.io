/// <reference types="vite-plus/test/browser-playwright" />
import { afterEach, expect, it } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser";

import { plainGlobalCss } from "#src/styles/plain-global-css.ts";

import { revealTheme } from "./theme-reveal";

const root = document.documentElement;

afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  root.classList.remove("dark-mode");
  document.head.querySelector("style[data-test]")?.remove();
  document.body.replaceChildren();
});

const mountToggle = () => {
  const style = document.createElement("style");
  style.dataset.test = "";
  style.textContent = plainGlobalCss;
  document.head.append(style);
  const toggle = document.createElement("button");
  toggle.textContent = "Use dark mode";
  Object.assign(toggle.style, {
    position: "fixed",
    left: "100px",
    top: "50px",
    width: "20px",
    height: "20px"
  });
  document.body.append(toggle);
  return toggle;
};

const flip = () => void root.classList.toggle("dark-mode");

const rootAnimations = (property: "clipPath" | "opacity") =>
  document
    .getAnimations()
    .filter(
      animation =>
        animation.effect instanceof KeyframeEffect &&
        animation.effect.pseudoElement?.endsWith("(root)") &&
        animation.effect.getKeyframes().some(frame => property in frame)
    );

it("switches the theme behind a circle that grows from the toggle to the far corner, with no crossfade", async () => {
  const transition = revealTheme(mountToggle(), flip);

  await transition?.ready;
  expect(root.classList.contains("dark-mode")).toBe(true);
  await expect.poll(() => rootAnimations("clipPath").length).toBe(1);
  const [circle] = rootAnimations("clipPath");
  if (!(circle.effect instanceof KeyframeEffect)) throw new Error("no keyframes");
  const [from, to] = circle.effect.getKeyframes().map(frame => String(frame.clipPath));
  const crossfades = rootAnimations("opacity");
  await transition?.finished;

  expect(from).toBe("circle(0px at 110px 60px)");
  expect(to).toMatch(/^circle\([\d.]+px at 110px 60px\)$/);
  expect(Number.parseFloat(to.slice("circle(".length))).toBeCloseTo(
    Math.hypot(innerWidth - 110, innerHeight - 60),
    1
  );
  expect(crossfades).toEqual([]);
});

it("still reveals a second click's theme in a circle after the first transition is skipped", async () => {
  const toggle = mountToggle();
  const first = revealTheme(toggle, flip);
  const second = revealTheme(toggle, flip);

  await first?.finished;
  await second?.ready;
  await expect.poll(() => rootAnimations("clipPath").length).toBe(1);
  expect(rootAnimations("opacity")).toEqual([]);

  await second?.finished;
  expect(root.classList.contains("dark-mode")).toBe(false);
});

it("crossfades without the circle when the visitor prefers reduced motion", async () => {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });

  const transition = revealTheme(mountToggle(), flip);

  await transition?.ready;
  expect(root.classList.contains("dark-mode")).toBe(true);
  expect(rootAnimations("opacity").length).toBeGreaterThan(0);
  expect(rootAnimations("clipPath")).toEqual([]);
  await transition?.finished;
});
