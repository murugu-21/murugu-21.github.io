import plugin from "./effect.ts";
import { tester } from "./rule-tester.ts";

const useFn = ({ name, service, line }: { name: string; service: string; line: number }) => ({
  messageId: "useFn",
  data: { name, service },
  line
});

tester.run("use-fn", plugin.rules["use-fn"], {
  valid: [
    {
      name: "methods wrapped in Effect.fn or Effect.fnUntraced, and values that aren't functions",
      code: `const layer = Layer.effect(
  Posts,
  Effect.gen(function* () {
    const repository = yield* PostsRepository;
    return {
      all: repository.all,
      find: Effect.fn("Posts.find")(function* (slug) {
        return { slug, read: () => slug };
      }),
      count: Effect.fnUntraced(function* () {
        return yield* repository.count;
      })
    };
  })
);`
    },
    {
      name: "objects that no layer provides",
      code: `const handlers = { find: slug => slug };
const layer = Layer.succeed(Posts, { all: Effect.succeed(handlers) });
const pipeline = all.pipe(Effect.map(posts => ({ first: () => posts[0] })));
const merged = Layer.mergeAll(Layer.succeed(Posts, impl), { extra: () => 1 });`
    },
    {
      name: "layers whose service isn't a plain identifier",
      code: `const posts = Layer.succeed(Services.Posts, { find: slug => slug });
const mail = Layer.effect(tag("Mail"), Effect.gen(function* () {
  return { send: message => message };
}));`
    }
  ],
  invalid: [
    {
      name: "a plain literal passed to Layer.succeed, in every function form",
      code: `const layer = Layer.succeed(PostsRepository, {
  all: Effect.succeed([]),
  findBySlug: slug => Effect.succeed(slug),
  count: function () { return Effect.succeed(0); },
  latest() { return Effect.succeed(null); }
});`,
      errors: [
        useFn({ name: "findBySlug", service: "PostsRepository", line: 3 }),
        useFn({ name: "count", service: "PostsRepository", line: 4 }),
        useFn({ name: "latest", service: "PostsRepository", line: 5 })
      ]
    },
    {
      name: "the object a build function returns, from an arrow body or any return",
      code: `const quota = Layer.effect(
  Quota,
  WorkerEnv.useSync(env => ({ take: client => env.take(client) }))
);
const mail = Layer.effect(
  Mail,
  WorkerEnv.useSync(env => {
    if (!env.MAIL) return { send: () => Effect.void };
    return { send: message => env.MAIL.send(message) };
  })
);`,
      errors: [
        useFn({ name: "take", service: "Quota", line: 3 }),
        useFn({ name: "send", service: "Mail", line: 8 }),
        useFn({ name: "send", service: "Mail", line: 9 })
      ]
    },
    {
      name: "the object Layer.sync's build function returns",
      code: `const clock = Layer.sync(Clock, () => ({ now: () => Effect.succeed(Date.now()) }));`,
      errors: [useFn({ name: "now", service: "Clock", line: 1 })]
    }
  ]
});
