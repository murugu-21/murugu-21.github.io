import {afterEach, describe, expect, it, vi} from "vitest";
import {parseHTML} from "linkedom";

import {initClickTracking, tag, track, upgrade} from "./analytics";

// The real tag defines window.clarity as a queue stub (see
// ../layouts/Layout.astro); tests stand in a spy for it and delete it again so
// the "analytics not loaded" cases are exercised on a clean global.
const withClarity = () => {
  const spy = vi.fn();
  (globalThis as {clarity?: unknown}).clarity = spy;
  return spy;
};

afterEach(() => {
  delete (globalThis as {clarity?: unknown}).clarity;
});

describe("track", () => {
  it("forwards the event name to clarity", () => {
    const clarity = withClarity();
    track("resume_download");
    expect(clarity.mock.calls).toEqual([["event", "resume_download"]]);
  });

  it("sets each tag before firing the event", () => {
    const clarity = withClarity();
    track("social_click", {social: "github"});
    expect(clarity.mock.calls).toEqual([
      ["set", "social", "github"],
      ["event", "social_click"]
    ]);
  });

  it("skips tags with a blank value", () => {
    const clarity = withClarity();
    track("blog_card_click", {post: "", tag: "  "});
    expect(clarity.mock.calls).toEqual([["event", "blog_card_click"]]);
  });

  it("does nothing when the tag was never loaded", () => {
    expect(() => track("resume_download")).not.toThrow();
  });

  it("swallows failures from inside clarity", () => {
    (globalThis as {clarity?: unknown}).clarity = () => {
      throw new Error("tag blocked");
    };
    expect(() => track("resume_download")).not.toThrow();
  });
});

describe("tag", () => {
  it("sets a custom tag", () => {
    const clarity = withClarity();
    tag("theme", "dark");
    expect(clarity.mock.calls).toEqual([["set", "theme", "dark"]]);
  });

  it("ignores a blank value", () => {
    const clarity = withClarity();
    tag("theme", "");
    expect(clarity).not.toHaveBeenCalled();
  });
});

describe("upgrade", () => {
  it("asks clarity to keep the session recording", () => {
    const clarity = withClarity();
    upgrade("chat");
    expect(clarity.mock.calls).toEqual([["upgrade", "chat"]]);
  });
});

describe("initClickTracking", () => {
  const dom = (body: string) => {
    const {document} = parseHTML(`<html><body>${body}</body></html>`);
    return document;
  };
  const click = (el: {dispatchEvent: (e: Event) => void}, doc: Document) => {
    const Event_ = (doc.defaultView as unknown as {Event: typeof Event}).Event;
    el.dispatchEvent(new Event_("click", {bubbles: true}));
  };

  it("fires the annotated event when the link is clicked", () => {
    const clarity = withClarity();
    const doc = dom(`<a id="cv" data-clarity-event="resume_download">CV</a>`);
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("cv")!, doc as unknown as Document);
    expect(clarity.mock.calls).toEqual([["event", "resume_download"]]);
  });

  it("resolves the nearest annotated ancestor of the click target", () => {
    const clarity = withClarity();
    const doc = dom(
      `<a data-clarity-event="social_click" data-clarity-tag="social" data-clarity-value="github"><svg id="glyph"></svg></a>`
    );
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("glyph")!, doc as unknown as Document);
    expect(clarity.mock.calls).toEqual([
      ["set", "social", "github"],
      ["event", "social_click"]
    ]);
  });

  it("upgrades the session for links that ask for it", () => {
    const clarity = withClarity();
    const doc = dom(
      `<a id="cv" data-clarity-event="resume_download" data-clarity-upgrade></a>`
    );
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("cv")!, doc as unknown as Document);
    expect(clarity.mock.calls).toEqual([
      ["event", "resume_download"],
      ["upgrade", "resume_download"]
    ]);
  });

  it("ignores clicks with no annotated ancestor", () => {
    const clarity = withClarity();
    const doc = dom(`<a id="plain" href="/">Home</a>`);
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("plain")!, doc as unknown as Document);
    expect(clarity).not.toHaveBeenCalled();
  });

  it("attaches one listener however many times it is called", () => {
    const clarity = withClarity();
    const doc = dom(`<a id="cv" data-clarity-event="resume_download"></a>`);
    initClickTracking(doc as unknown as Document);
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("cv")!, doc as unknown as Document);
    expect(clarity.mock.calls).toEqual([["event", "resume_download"]]);
  });
});
