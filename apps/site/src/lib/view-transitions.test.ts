import { parseHTML } from "linkedom";
import { describe, expect, it } from "vite-plus/test";

import { pairSharedElements } from "./view-transitions";

const LIST = `<html><body>
  <h1 data-shared>Blog</h1>
  <ol>
    <li><h2 data-post-href="/blog/first/"><a href="/blog/first/">First</a></h2></li>
    <li><h2 data-post-href="/blog/second/"><a href="/blog/second/">Second</a></h2></li>
  </ol>
</body></html>`;

const fakeTransition = () => {
  const { promise: finished, resolve: finish } = Promise.withResolvers<void>();
  return { finished, finish };
};

interface NavigationEventFields {
  activation?: { entry: { url: string } };
  viewTransition: ReturnType<typeof fakeTransition> | null;
}

const fakeNavigationEvent = (type: "pageswap" | "pagereveal", fields: NavigationEventFields) =>
  Object.assign(new Event(type), fields);

interface FakeNavigation {
  activation: { from: { url: string } | null };
}

class FakePage extends EventTarget {
  document = parseHTML(LIST).document;
  innerHeight = 800;
  navigation: FakeNavigation = { activation: { from: null } };

  constructor() {
    super();
    this.place("h1", 40);
    this.place('[data-post-href="/blog/first/"]', 200);
    this.place('[data-post-href="/blog/second/"]', 400);
  }

  place(selector: string, top: number) {
    const element = this.document.querySelector(selector);
    if (!element) throw new Error(`no ${selector}`);
    const bottom = top + 60;
    element.getBoundingClientRect = () => ({
      x: 0,
      y: top,
      width: 600,
      height: 60,
      top,
      right: 600,
      bottom,
      left: 0,
      toJSON: () => ({})
    });
  }

  swapTo(url: string, viewTransition: ReturnType<typeof fakeTransition> | null) {
    this.dispatchEvent(
      fakeNavigationEvent("pageswap", { activation: { entry: { url } }, viewTransition })
    );
  }

  revealFrom(url: string | null, viewTransition: ReturnType<typeof fakeTransition> | null) {
    this.navigation.activation.from = url === null ? null : { url };
    this.dispatchEvent(fakeNavigationEvent("pagereveal", { viewTransition }));
  }

  get morphing() {
    return [...this.document.querySelectorAll("[data-morph]")].map(title =>
      title.getAttribute("data-post-href")
    );
  }

  get offscreen() {
    return this.document.querySelector("h1")?.hasAttribute("data-offscreen");
  }
}

const settle = () => new Promise(resolve => setTimeout(resolve));

describe("pairSharedElements", () => {
  it("names only the title linking to the post being opened, until the transition ends", async () => {
    const page = new FakePage();
    pairSharedElements(page);
    const transition = fakeTransition();

    page.swapTo("https://murugappan.dev/blog/second/", transition);
    expect(page.morphing).toEqual(["/blog/second/"]);

    transition.finish();
    await settle();
    expect(page.morphing).toEqual([]);
  });

  it("names the title of the post being returned from", () => {
    const page = new FakePage();
    pairSharedElements(page);

    page.revealFrom("https://murugappan.dev/blog/first/", fakeTransition());
    expect(page.morphing).toEqual(["/blog/first/"]);
  });

  it("leaves a title scrolled out of view unnamed, so it doesn't fly in from off screen", () => {
    const page = new FakePage();
    pairSharedElements(page);
    page.place('[data-post-href="/blog/second/"]', 900);

    page.revealFrom("https://murugappan.dev/blog/second/", fakeTransition());
    expect(page.morphing).toEqual([]);
    page.revealFrom("https://murugappan.dev/blog/first/", fakeTransition());
    expect(page.morphing).toEqual(["/blog/first/"]);
  });

  it("marks an always-named element that is off screen, and unmarks it once back in view", () => {
    const page = new FakePage();
    pairSharedElements(page);

    page.place("h1", -11000);
    page.swapTo("https://murugappan.dev/blog/first/", fakeTransition());
    expect(page.offscreen).toBe(true);

    page.place("h1", 40);
    page.revealFrom("https://murugappan.dev/blog/first/", fakeTransition());
    expect(page.offscreen).toBe(false);
  });

  it("moves a name left over from a page restored from bfcache, so it isn't repeated", () => {
    const page = new FakePage();
    pairSharedElements(page);
    page.swapTo("https://murugappan.dev/blog/first/", fakeTransition());

    page.revealFrom("https://murugappan.dev/blog/second/", fakeTransition());
    expect(page.morphing).toEqual(["/blog/second/"]);

    page.revealFrom(null, fakeTransition());
    expect(page.morphing).toEqual([]);
  });

  it("changes nothing when the navigation has no view transition", () => {
    const page = new FakePage();
    pairSharedElements(page);
    page.swapTo("https://murugappan.dev/blog/first/", fakeTransition());

    page.place("h1", -11000);
    page.swapTo("https://murugappan.dev/blog/second/", null);
    expect(page.morphing).toEqual(["/blog/first/"]);
    expect(page.offscreen).toBe(false);
  });
});
