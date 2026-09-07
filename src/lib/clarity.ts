// Microsoft Clarity — session recordings and heatmaps only. PostHog owns
// events (see ./analytics.ts); Clarity's recording UI is the better tool for
// watching a session back and it is unmetered, where PostHog's replay is
// quota'd. PostHog is therefore initialised with disable_session_recording.
//
// Shared by both apps so the snippet exists once: ../layouts/Layout.astro and
// ../blog/components/BaseHead.astro inject the result with set:html. It has to
// be a built string rather than inline markup because a <script> nested in an
// Astro template expression can't hold braces — they parse as expressions.

/**
 * Build the Clarity bootstrap for a project id, or null when there is no id
 * (local dev, CI) so the tag is omitted entirely.
 *
 * The `window.clarity` queue stub is **required**, even though none of our own
 * code calls `clarity()`. Clarity's tag script is invoked as
 *
 *   ("clarity", document, window, "script", {projectId, upload, …})
 *
 * and calls `window.clarity("metadata", …)` and `("set", "C_IS", "0")` on
 * itself as it initialises. Without the stub it throws "Cannot read properties
 * of undefined (reading 'v')" and records nothing, with no other symptom.
 * ./clarity.test.ts guards this.
 *
 * The tag is fetched on idle so it stays out of the initial load waterfall;
 * the stub buffers the tag's own early calls until it arrives.
 */
export function claritySnippet(projectId: string | undefined): string | null {
  // trim(): a stray space pasted into the build env var otherwise 400s the URL.
  const id = projectId?.trim();
  if (!id) return null;
  // JSON.stringify, not string concatenation: the id comes from build env, and
  // it is being embedded in JavaScript source.
  return `(function () {
  window.clarity =
    window.clarity ||
    function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
  var loadClarity = function () {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.clarity.ms/tag/" + ${JSON.stringify(id)};
    document.head.appendChild(s);
  };
  if ("requestIdleCallback" in window) {
    requestIdleCallback(loadClarity, {timeout: 3000});
  } else {
    setTimeout(loadClarity, 2000);
  }
})();`;
}
