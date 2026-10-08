import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

import { ListenControls } from "./ListenControls.tsx";

const POST = `<article class="blog-post">
  <header><h1>Read me</h1></header>
  <section data-post-body>
    <p>Hello <a href="#">big</a> world.</p>
    <pre>const skipped = true;</pre>
    <p>Second one.</p>
  </section>
</article>`;

const TIMINGS = {
  version: 2,
  slug: "hello",
  duration: 9.5,
  blocks: [
    { text: "Read me", start: 0, end: 1.5 },
    {
      text: "Hello big world.",
      start: 2,
      end: 5,
      words: [
        { w: "Hello", s: 2, e: 2.5 },
        { w: "big", s: 2.6, e: 3 },
        { w: "world.", s: 3.1, e: 4 }
      ]
    },
    { text: "Second one.", start: 5.5, end: 9 }
  ]
};

// Only /blog/audio/hello.json exists, and only when `timings` is given.
const serveAudio = (timings?: unknown) => {
  const requested: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    requested.push(url);
    const found = timings !== undefined && url === "/blog/audio/hello.json";
    return Promise.resolve(found ? Response.json(timings) : new Response("", { status: 404 }));
  });
  return requested;
};

// A speechSynthesis that records utterances; the test fires their events.
// Like Chrome, cancel() errors the utterance it cuts off, synchronously.
const fakeSpeech = () => {
  const spoken: SpeechSynthesisUtterance[] = [];
  vi.stubGlobal("speechSynthesis", {
    speak: (u: SpeechSynthesisUtterance) => spoken.push(u),
    cancel: () => {
      const u = spoken.at(-1);
      u?.dispatchEvent(
        new SpeechSynthesisErrorEvent("error", { utterance: u, error: "interrupted" })
      );
    }
  });
  const last = () => {
    const u = spoken.at(-1);
    if (!u) throw new Error("nothing spoken yet");
    return u;
  };
  const fire = (type: string, init: Partial<SpeechSynthesisEventInit> = {}) =>
    last().dispatchEvent(new SpeechSynthesisEvent(type, { utterance: last(), ...init }));
  return {
    texts: () => spoken.map(u => u.text),
    rate: () => last().rate,
    start: () => fire("start"),
    word: (charIndex: number) => fire("boundary", { name: "word", charIndex }),
    end: () => fire("end"),
    fail: () =>
      last().dispatchEvent(
        new SpeechSynthesisErrorEvent("error", { utterance: last(), error: "synthesis-failed" })
      )
  };
};

// An <audio> that plays instantly; the test moves its playhead.
const audios: FakeAudio[] = [];
class FakeAudio extends EventTarget {
  currentTime = 0;
  duration = Number.NaN;
  playbackRate = 1;
  preload = "";
  paused = true;
  constructor(readonly src: string) {
    super();
    audios.push(this);
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}
const lastAudio = () => {
  const audio = audios.at(-1);
  if (!audio) throw new Error("no audio element created");
  return audio;
};

// The speed outlives a mount, so a test that fails mid-way must not leave the
// next one at its speed. Set by each mount, run after each test.
let resetRate: (() => Promise<void>) | null = null;

const mount = async (html = POST) => {
  document.body.insertAdjacentHTML("beforeend", `<div id="page">${html}</div>`);
  const island = document.createElement("div");
  island.className = "listen-island";
  document.body.append(island);
  const screen = await render(<ListenControls slug="hello" />, { container: island });
  const read = (selector: string) => document.querySelector(selector)?.textContent ?? null;
  const pill = screen.getByRole("button", { name: /playback speed$/ });
  const pickRate = async (label: string) => {
    await userEvent.click(pill);
    await userEvent.click(screen.getByRole("menuitemradio", { name: label }));
  };
  resetRate = async () => {
    const shown = pill.query()?.textContent;
    if (shown && shown !== "1×") await pickRate("1×");
  };
  return {
    screen,
    island,
    listen: screen.getByRole("button", { name: "Listen" }),
    pause: screen.getByRole("button", { name: "Pause" }),
    // Elapsed, total and the speed pill, as the reader sees them.
    readout: () => island.textContent,
    // The page docks the bar while this class is set.
    listening: () => island.classList.contains("listening"),
    block: () => read(".is-speaking"),
    word: () => read(".is-word"),
    pickRate
  };
};

beforeAll(() => {
  localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  await resetRate?.();
  resetRate = null;
  document.getElementById("page")?.remove();
  document.querySelectorAll(".listen-island").forEach(island => island.remove());
  audios.length = 0;
  vi.unstubAllGlobals();
});

it("reads the post block by block with speech synthesis when it has no audio", async () => {
  serveAudio();
  const speech = fakeSpeech();
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toHaveAttribute("aria-pressed", "true");
  await expect.poll(ui.listening).toBe(true);
  speech.start();
  await expect.poll(ui.readout).toBe("1/3¶1×");
  expect(ui.block()).toBe("Read me");

  speech.end();
  speech.start();
  speech.word(6);
  await expect.poll(ui.readout).toBe("2/3¶1×");
  expect(ui.block()).toBe("Hello big world.");
  expect(ui.word()).toBe("big");

  // Resuming restarts the paragraph that was cut off.
  await userEvent.click(ui.pause);
  await expect.element(ui.listen).toHaveAttribute("aria-pressed", "false");
  // Paused, not stopped: the place and the docked bar stay.
  expect(ui.readout()).toBe("2/3¶1×");
  expect(ui.listening()).toBe(true);
  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toBeVisible();

  speech.end();
  speech.start();
  await expect.poll(ui.readout).toBe("3/3¶1×");
  speech.end();
  await expect.element(ui.listen).toBeVisible();
  expect(speech.texts()).toEqual([
    "Read me",
    "Hello big world.",
    "Hello big world.",
    "Second one."
  ]);
  expect(ui.readout()).toBe("0/3¶1×");
  expect(ui.block()).toBeNull();
  await expect.poll(ui.listening).toBe(false);
});

it("lights the word a speech boundary points at, late in a long paragraph", async () => {
  serveAudio();
  const speech = fakeSpeech();
  const ui = await mount(`<article class="blog-post">
    <header><h1>Read me</h1></header>
    <section data-post-body><p>It is a long way to go.</p></section>
  </article>`);

  await userEvent.click(ui.listen);
  speech.start();
  speech.end();
  speech.start();
  speech.word(13);
  await expect.poll(ui.word).toBe("way");
  expect(ui.block()).toBe("It is a long way to go.");
});

it("stops on a speech synthesis error and when the reader leaves the page", async () => {
  serveAudio();
  const speech = fakeSpeech();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const ui = await mount();

  await userEvent.click(ui.listen);
  speech.start();
  await expect.poll(ui.block).toBe("Read me");
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  await expect.element(ui.listen).toHaveAttribute("aria-pressed", "false");

  await userEvent.click(ui.listen);
  speech.start();
  await expect.element(ui.pause).toBeVisible();
  speech.fail();
  await expect.element(ui.listen).toBeVisible();
  expect(ui.block()).toBeNull();
  expect(speech.texts()).toEqual(["Read me", "Read me"]);
});

it("plays the pre-rendered audio, lighting the block and word under the playhead", async () => {
  serveAudio(TIMINGS);
  vi.stubGlobal("Audio", FakeAudio);
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toHaveAttribute("aria-pressed", "true");
  const audio = lastAudio();
  expect(audio.src).toBe("/blog/audio/hello.mp3");
  expect(ui.readout()).toBe("0:000:091×");

  audio.currentTime = 2.7;
  await expect.poll(ui.word).toBe("big");
  expect(ui.block()).toBe("Hello big world.");
  expect(ui.readout()).toBe("0:020:091×");

  // Seeking past the last block keeps the highlight; back to the start lights the title.
  ui.screen.getByRole("slider", { name: "Seek" }).element().focus();
  await userEvent.keyboard("{End}");
  expect(audio.currentTime).toBe(9.5);
  await expect.poll(ui.readout).toBe("0:090:091×");
  expect(ui.block()).toBe("Hello big world.");
  await userEvent.keyboard("{Home}");
  await expect.poll(ui.block).toBe("Read me");
  expect(ui.word()).toBeNull();

  await ui.pickRate("1.25×");
  expect(audio.playbackRate).toBe(1.25);

  await userEvent.click(ui.pause);
  await expect.element(ui.listen).toHaveAttribute("aria-pressed", "false");
  expect(audio.paused).toBe(true);
  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toBeVisible();

  // At the end the media element fires pause, then ended.
  audio.currentTime = 9.5;
  audio.pause();
  audio.dispatchEvent(new Event("ended"));
  await expect.element(ui.listen).toBeVisible();
  await expect.poll(ui.block).toBeNull();
  expect(audio.currentTime).toBe(0);
  await expect.poll(ui.listening).toBe(false);
});

it("falls back to speech synthesis when the audio fails to load", async () => {
  serveAudio(TIMINGS);
  const speech = fakeSpeech();
  const rejections: Promise<void>[] = [];
  vi.stubGlobal(
    "Audio",
    class extends FakeAudio {
      override play() {
        this.dispatchEvent(new Event("error"));
        const rejected = Promise.reject(new DOMException("no source", "NotSupportedError"));
        rejections.push(rejected.catch(() => {}));
        return rejected;
      }
    }
  );
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toBeVisible();
  // The rejected play() settles after the fallback took over.
  await Promise.all(rejections);
  await expect.element(ui.pause).toBeVisible();
  speech.start();
  await expect.poll(ui.readout).toBe("1/3¶1×");
  expect(speech.texts()).toEqual(["Read me"]);
});

it("falls back to speech synthesis when the audio player can't be built", async () => {
  serveAudio(TIMINGS);
  const speech = fakeSpeech();
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        throw new DOMException("media blocked", "NotSupportedError");
      }
    }
  );
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toHaveAttribute("aria-pressed", "true");
  speech.start();
  await expect.poll(ui.readout).toBe("1/3¶1×");
  expect(speech.texts()).toEqual(["Read me"]);
});

it("a refused play leaves the control ready to try again", async () => {
  serveAudio(TIMINGS);
  let refusals = 1;
  vi.stubGlobal(
    "Audio",
    class extends FakeAudio {
      override play() {
        if (refusals-- > 0) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        return super.play();
      }
    }
  );
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.listen).toBeEnabled();
  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toHaveAttribute("aria-pressed", "true");
  expect(audios.length).toBe(1);
});

it.each([
  ["timings in a format it doesn't know", () => serveAudio({ ...TIMINGS, version: 3 })],
  ["a network error", () => vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")))]
])("uses speech synthesis after %s", async (_, serve) => {
  serve();
  const speech = fakeSpeech();
  vi.stubGlobal("Audio", FakeAudio);
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.pause).toBeVisible();
  expect(speech.texts()).toEqual(["Read me"]);
  expect(audios.length).toBe(0);
});

it("with neither audio nor speech synthesis, retries on the next press", async () => {
  const requested = serveAudio();
  vi.stubGlobal("speechSynthesis", undefined);
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.poll(() => requested.length).toBe(1);
  await expect.element(ui.listen).toBeEnabled();
  await userEvent.click(ui.listen);
  await expect.poll(() => requested).toEqual(["/blog/audio/hello.json", "/blog/audio/hello.json"]);
  await expect.element(ui.listen).toBeEnabled();
});

it("stays disabled on a page with nothing to read", async () => {
  const bare = await mount("<article class='blog-post'><p>No post body here.</p></article>");
  await expect.element(bare.listen).toBeDisabled();
  await expect
    .element(bare.screen.getByRole("button", { name: "1× playback speed" }))
    .toBeDisabled();

  await bare.screen.unmount();
  document.getElementById("page")?.remove();
  const post = await mount();
  await expect.element(post.listen).toBeEnabled();
  await expect
    .element(post.screen.getByRole("button", { name: "1× playback speed" }))
    .toBeEnabled();
});

it("a speed picked while the audio loads applies once playback starts", async () => {
  let respond: (res: Response) => void = () => {};
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => (respond = resolve)));
  const speech = fakeSpeech();
  const ui = await mount();

  await userEvent.click(ui.listen);
  await expect.element(ui.screen.getByRole("button", { name: "Loading" })).toBeDisabled();
  await ui.pickRate("1.25×");
  respond(new Response("", { status: 404 }));
  await expect.element(ui.pause).toBeVisible();
  expect(speech.rate()).toBe(1.25);
});

it("restarts the current block at the chosen speed and remembers it", async () => {
  serveAudio();
  const speech = fakeSpeech();
  const ui = await mount();

  await userEvent.click(ui.listen);
  speech.start();
  await ui.pickRate("1.5×");
  expect(speech.texts()).toEqual(["Read me", "Read me"]);
  expect(speech.rate()).toBe(1.5);
  expect(localStorage.getItem("listenRate")).toBe("1.5");
  await expect
    .element(ui.screen.getByRole("button", { name: "1.5× playback speed" }))
    .toBeVisible();

  await userEvent.click(ui.screen.getByRole("button", { name: "1.5× playback speed" }));
  await expect
    .element(ui.screen.getByRole("menuitemradio", { name: "1.5×" }))
    .toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");

  // While paused nothing restarts; the next block plays at the new speed.
  await userEvent.click(ui.pause);
  await ui.pickRate("1×");
  expect(localStorage.getItem("listenRate")).toBe("1");
  expect(speech.texts()).toEqual(["Read me", "Read me"]);
  await userEvent.click(ui.listen);
  expect(speech.texts()).toEqual(["Read me", "Read me", "Read me"]);
  expect(speech.rate()).toBe(1);
});
