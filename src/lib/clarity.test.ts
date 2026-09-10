import { describe, expect, it } from "vitest";

import { claritySnippet } from "./clarity";

describe("claritySnippet", () => {
  it("emits nothing without a project id (local dev, CI)", () => {
    expect(claritySnippet(undefined)).toBeNull();
    expect(claritySnippet("")).toBeNull();
    expect(claritySnippet("   ")).toBeNull();
  });

  // The regression this file exists for. Clarity's tag script is invoked as
  //   ("clarity", document, window, "script", {projectId, upload, …})
  // and calls window.clarity("metadata", …) / ("set", "C_IS", "0") on itself.
  // The queue stub is the snippet's job, not the tag's — drop it and the tag
  // throws "Cannot read properties of undefined (reading 'v')" and records
  // nothing, silently. Our own code never calls clarity(); Clarity does.
  it("defines the window.clarity queue stub the tag calls into", () => {
    const snippet = claritySnippet("y02rymlwm4");
    expect(snippet).toContain("window.clarity =");
    expect(snippet).toContain("window.clarity.q");
  });

  it("defines the stub before requesting the tag", () => {
    const snippet = claritySnippet("y02rymlwm4")!;
    expect(snippet.indexOf("window.clarity =")).toBeLessThan(snippet.indexOf("clarity.ms/tag/"));
  });

  it("loads the tag on idle so it stays off the initial waterfall", () => {
    const snippet = claritySnippet("y02rymlwm4")!;
    expect(snippet).toContain("requestIdleCallback");
    expect(snippet).toContain("setTimeout");
  });

  it("embeds the project id as a quoted string", () => {
    expect(claritySnippet("y02rymlwm4")).toContain('"y02rymlwm4"');
  });

  it("trims a project id pasted with stray whitespace", () => {
    // A stray space in the build env var otherwise 400s the tag URL.
    expect(claritySnippet("  y02rymlwm4 ")).toContain('"y02rymlwm4"');
  });

  it("cannot be broken out of by a hostile project id", () => {
    const snippet = claritySnippet('x" + alert(1) + "')!;
    expect(snippet).not.toContain('" + alert(1) + "');
    expect(snippet).toContain('"x\\" + alert(1) + \\""');
  });
});
