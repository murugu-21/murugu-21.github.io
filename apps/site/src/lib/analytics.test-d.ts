import { expectTypeOf } from "vite-plus/test";

import type { PostSlug } from "@murugappan/contracts/api/slug.ts";
import {
  reportError,
  tag,
  track,
  type ScriptEvents,
  type SuperProperties
} from "#src/lib/analytics.ts";

type PropsOf<M> = { [K in keyof M]: M[K] extends null ? never : NonNullable<M[K]> }[keyof M];
type ValuesOf<P> = P extends unknown ? P[keyof P] : never;
type TakesAnyString<V> = V extends unknown ? (string extends V ? V : never) : never;

expectTypeOf<TakesAnyString<ValuesOf<PropsOf<ScriptEvents>>>>().toBeNever();
expectTypeOf<TakesAnyString<SuperProperties[keyof SuperProperties]>>().toBeNever();

declare const typed: string;
declare const slug: PostSlug;

track("chat_message_sent");
track("listen_play", { post: slug });
tag({ theme: "dark" });
reportError(new Error("boom"), { surface: "chat" });

// @ts-expect-error An event without properties takes none, so a message can't ride along.
track("chat_message_sent", { text: typed });
// @ts-expect-error A post is a slug, not whatever string is at hand.
track("listen_play", { post: typed });
// @ts-expect-error Only the events listed in ScriptEvents exist.
track("chat_message_typed");
// @ts-expect-error A super property holds one of its listed values.
tag({ theme: typed });
// @ts-expect-error An error's context is where it happened, not free text.
reportError(new Error("boom"), { surface: typed });
