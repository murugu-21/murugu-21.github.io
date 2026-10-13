import { describe, expect, it } from "vite-plus/test";

import { fetchActivity } from "#src/modules/chat/chat-room.durable-object.ts";

describe("fetchActivity", () => {
  it("omits the detail when the url is unparseable", () => {
    expect(fetchActivity("not a url")).toEqual({ name: "fetch_page" });
  });
});
