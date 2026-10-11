import { Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";

import { WorkerEnv } from "#src/common/di/worker-env.ts";
import { ContactQuotaRepository } from "#src/modules/rate-limit/contact-quota.repository.ts";
import { sharedLimiter, testEnv } from "./fixtures";

/** Runs a quota call against the real repository over this test's bindings, returning its failure. */
const failureOf = <A, E>(call: (quota: ContactQuotaRepository["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    ContactQuotaRepository.use(call).pipe(
      Effect.flip,
      Effect.provide(
        ContactQuotaRepository.layer.pipe(Layer.provide(Layer.succeed(WorkerEnv, testEnv())))
      )
    )
  );

describe("ContactQuotaRepository", () => {
  it("turns a site-wide denial from the limiter into ContactLimitReached", async () => {
    vi.spyOn(sharedLimiter(), "takeContactSlot").mockResolvedValue({
      allowed: false,
      scope: "global",
      clientRemaining: 3,
      globalRemaining: 0
    });
    const failure = await failureOf(quota => quota.take("203.0.113.30"));
    expect(failure).toMatchObject({
      _tag: "ContactLimitReached",
      scope: "global",
      usage: { clientRemaining: 3, globalRemaining: 0 }
    });
  });

  it.each(["takeContactSlot", "contactUsage"] as const)(
    "turns a failed %s call into QuotaUnavailable carrying the cause",
    async rpc => {
      const cause = new Error("limiter down");
      vi.spyOn(sharedLimiter(), rpc).mockRejectedValue(cause);
      const failure = await failureOf(quota =>
        rpc === "takeContactSlot" ? quota.take("203.0.113.31") : quota.usage("203.0.113.31")
      );
      expect(failure).toMatchObject({ _tag: "QuotaUnavailable", cause });
    }
  );
});
