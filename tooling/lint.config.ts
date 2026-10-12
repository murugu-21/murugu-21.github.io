// The root vite.config.ts loads this, so every path in it is relative to the repo root.
import type { OxlintConfig, OxlintOverride } from "vite-plus/lint";

type Pattern = { regex: string; message: string; allowTypeImports?: boolean };

// Each layer is a folder in a workspace package (README.md › Imports). It imports itself and the
// layers in `uses`: inside its own package by the subpath import in `imports`, from another
// package by name. import/no-relative-parent-imports stops `../` from going around them.
const LAYER_NAMES = [
  "site",
  "api",
  "siteScripts",
  "tts",
  "tooling",
  "brand",
  "content",
  // After content: a file gets the last matching override, and this folder sits inside it.
  "contentVite",
  "contracts",
  "utils"
] as const;
type LayerName = (typeof LAYER_NAMES)[number];
// `imports` is left out for a layer nothing imports.
type Layer = { dir: string; pkg: string; imports?: string; uses: LayerName[]; also?: Pattern[] };

// Contracts and content reach both the browser bundle and the Worker, so they take no framework.
const FRAMEWORKS =
  "^(astro|@astrojs/|hono|agents|ai$|@ai-sdk/|@cloudflare/|cloudflare:|node:|react|@modelcontextprotocol/)";

const NO_TEST_FIXTURES: Pattern = {
  regex: "^#test/",
  message:
    "Only tests import #test/ fixtures. Move what Worker code needs into apps/api/src/ (apps/api/README.md › Layers)."
};

const LAYERS: Record<LayerName, Layer> = {
  site: {
    dir: "apps/site/src/",
    pkg: "@murugappan/site",
    imports: "#src/",
    uses: ["content", "contracts", "utils"]
  },
  api: {
    dir: "apps/api/{src,test}/",
    pkg: "@murugappan/api",
    imports: "#src/",
    uses: ["content", "contracts", "utils"]
  },
  siteScripts: {
    dir: "apps/site/scripts/",
    pkg: "@murugappan/site",
    imports: "#scripts/",
    uses: ["site", "contracts", "utils"]
  },
  tts: { dir: "apps/tts/", pkg: "@murugappan/tts", uses: ["content", "contracts", "utils"] },
  tooling: { dir: "tooling/", pkg: "@murugappan/tooling", uses: [] },
  brand: { dir: "apps/brand/", pkg: "@murugappan/brand", uses: [] },
  content: {
    dir: "packages/content/",
    pkg: "@murugappan/content",
    imports: "@murugappan/content/",
    uses: ["contracts", "utils"],
    also: [
      {
        regex: `${FRAMEWORKS}|\\.(png|jpe?g|gif|webp|avif|svg)$`,
        allowTypeImports: true,
        message:
          "packages/content/ holds sources and pure functions the apps share, so it imports no framework, runtime package or image (type imports are fine). Resolve those in the app that needs them (README.md › Imports)."
      }
    ]
  },
  contracts: {
    dir: "packages/contracts/",
    pkg: "@murugappan/contracts",
    imports: "@murugappan/contracts/",
    uses: ["utils"],
    also: [
      {
        regex: FRAMEWORKS,
        allowTypeImports: true,
        message:
          "Contracts hold only shapes and import no framework or runtime package (type imports are fine). Keep framework and Worker code in apps/site/src/ or apps/api/src/ (README.md › Imports)."
      }
    ]
  },
  contentVite: {
    dir: "packages/content/vite/",
    pkg: "@murugappan/content",
    imports: "@murugappan/content/vite/",
    uses: ["content", "contracts", "utils"]
  },
  utils: {
    dir: "packages/utils/",
    pkg: "@murugappan/utils",
    imports: "@murugappan/utils/",
    uses: []
  }
};

// How `from` names `to`: by subpath import inside one package, by package name across two.
// A library's folders keep their own prefix (@murugappan/content/vite/), which already is one.
// A layer without `imports` has no name inside its own package.
function specifier({ from, to }: { from: LayerName; to: LayerName }): string[] {
  const { pkg, imports } = LAYERS[to];
  if (imports?.startsWith("@")) return [imports];
  if (LAYERS[from].pkg !== pkg) return [`${pkg}/`];
  return imports ? [imports] : [];
}

function layerPatterns(name: LayerName): Pattern[] {
  const allowed = new Set<LayerName>([name, ...LAYERS[name].uses]);
  const allowedSpecifiers = [...allowed].flatMap(to => specifier({ from: name, to }));
  const banned = [
    ...new Set(
      LAYER_NAMES.filter(other => !allowed.has(other)).flatMap(to => specifier({ from: name, to }))
    )
  ].filter(spec => !allowedSpecifiers.includes(spec));
  if (banned.length === 0) return [];
  return [
    {
      regex: `^(${banned.join("|")})`,
      message: `${LAYERS[name].dir} imports only ${allowedSpecifiers.join(", ")} (README.md › Imports). Move code both sides need to @murugappan/content, contracts or utils.`
    }
  ];
}

// A file gets the options of the last override that matches it, so each one carries every
// pattern that applies to its files.
const restrict = (files: string[], patterns: Pattern[]): OxlintOverride => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] }
});

const SITE = layerPatterns("site");
const NO_SITE_TEST_FAKES: Pattern = {
  regex: "^#src/test/",
  message:
    "Only tests import the #src/test/ fakes. Production code imports the astro: module the fake stands in for."
};
const SITE_TESTS = ["apps/site/src/**/*.test.ts", "apps/site/src/**/*.test.tsx"];

// restrict() for the site, so the layer loop below skips the site layer. Tests keep `patterns`
// and every other file also loses the fakes: the second override wins wherever it applies, so
// each file still gets one complete list.
const siteRestrict = (files: string[], patterns: Pattern[]): OxlintOverride[] => [
  restrict(files, patterns),
  { ...restrict(files, [...patterns, NO_SITE_TEST_FAKES]), excludeFiles: SITE_TESTS }
];

type ImportPath = {
  name: string;
  importNames: string[];
  allowTypeImports?: boolean;
  message: string;
};
type Property = { object?: string; property: string; message: string };

const WORKER_PROPERTIES: Property[] = [
  {
    object: "Math",
    property: "random",
    message:
      "Math.random() is predictable. Use crypto.randomUUID() or crypto.getRandomValues() (Cloudflare Workers › Best practices)."
  },
  {
    property: "passThroughOnException",
    message:
      "passThroughOnException hides the error. Catch it and answer, or let the router's exception filter do it (Cloudflare Workers › Best practices)."
  }
];

// The Worker's roles, by file suffix (apps/api/README.md › Layers). They replace the api layer's
// override, so the layer loop below skips it.
const API = layerPatterns("api");
const NO_EFFECT: Pattern[] = [
  {
    regex: "^effect($|/)",
    allowTypeImports: true,
    message:
      "Effect runs only in services, repositories, the DI wiring and tests (type imports are fine). Put the logic in a *.service.ts or *.repository.ts and call it from the controller with runInRequest (apps/api/README.md › Layers)."
  }
];

const ROUTE_AGENT: ImportPath = {
  name: "agents",
  importNames: ["routeAgentRequest"],
  message:
    "routeAgentRequest reaches every Durable Object class. Only modules/chat/chat.controller.ts calls it, behind its own routes (apps/api/README.md › Layers)."
};
const HONO_CONTEXT: ImportPath = {
  name: "hono",
  importNames: ["Context"],
  allowTypeImports: true,
  message:
    "Write the handler inline after its path so Hono infers its types, or build it with defineHandler() from hono/factory. A Context type import is fine."
};
const EFFECT_SCHEMA_MESSAGE =
  "Validate with zod from @murugappan/contracts, which the site shares, not effect/Schema (apps/api/README.md › Layers).";

const HTTP_IMPORTS: Pattern[] = [
  {
    regex: "\\.repository\\.ts$",
    allowTypeImports: true,
    message:
      "The HTTP layer calls a service through runInRequest, never a repository. Its error and record types are fine (apps/api/README.md › Layers)."
  },
  {
    regex: "\\.durable-object\\.ts$",
    allowTypeImports: true,
    message:
      "Reach a Durable Object through its repository or client, not from the HTTP layer. Type imports are fine (apps/api/README.md › Layers)."
  },
  {
    regex: "/di/worker-env\\.ts$",
    message:
      "Bindings reach Effect only through repositories and integration services (apps/api/README.md › Layers)."
  }
];
const PLUMBING_IMPORTS: Pattern[] = [
  {
    regex: "\\.service\\.ts$|^#src/app\\.module\\.ts$",
    message:
      "Guards, pipes, interceptors, middleware and filters gate or reshape a request. Call services and run programs in the controller (apps/api/README.md › Layers)."
  }
];
const DOMAIN_IMPORTS: Pattern[] = [
  {
    regex: "^hono($|/)",
    message:
      "Services and repositories don't know about HTTP. Return an outcome and let the controller build the response (apps/api/README.md › Layers)."
  },
  {
    regex:
      "\\.(controller|tools|resources|guard|pipe|interceptor|middleware|filter)\\.ts$|/common/http/|^#src/app\\.module\\.ts$",
    message:
      "Services and repositories don't import the HTTP layer or the DI wiring. Move what both need to a file without a suffix (apps/api/README.md › Layers)."
  },
  { regex: "^effect/Schema$", message: EFFECT_SCHEMA_MESSAGE }
];

const RUN_EFFECT: Property[] = [
  "runPromise",
  "runPromiseExit",
  "runSync",
  "runSyncExit",
  "runFork",
  "runCallback"
].map(property => ({
  object: "Effect",
  property,
  message:
    "Run an Effect only at the edge: runInRequest in app.module.ts runs every program (apps/api/README.md › Layers)."
}));
const SWALLOW_DEFECTS: Property[] = [
  ...[
    "catch",
    "catchCause",
    "catchDefect",
    "ignore",
    "ignoreCause",
    "sandbox",
    "orElseSucceed",
    "orDie"
  ].map(property => ({
    object: "Effect",
    property,
    message:
      "Let defects reach the exception filter, and handle each typed failure by tag with catchTag or catchTags so a new tag fails the type check (apps/api/README.md › Layers)."
  })),
  {
    object: "Effect",
    property: "promise",
    message:
      "Effect.promise turns a rejection into a defect. Use Effect.tryPromise with a tagged error, or disable this line saying why a rejection is a bug (apps/api/README.md › Layers)."
  }
];
const BINDINGS: Property = {
  object: "c",
  property: "env",
  message:
    "Only *.client.ts files, and repositories through WorkerEnv, read bindings. Move the call there (apps/api/README.md › Layers)."
};

const bySuffix = (...suffixes: string[]) => suffixes.map(s => `apps/api/src/**/*.${s}.ts`);
const DOMAIN = bySuffix("service", "repository");
const HTTP = bySuffix("controller", "tools", "resources");
const PLUMBING = bySuffix("guard", "pipe", "interceptor", "middleware", "filter");

// What sets one role apart. apiRole adds the api layer's patterns and the Workers bans, and
// each rule's list is whole, since an override replaces a rule's options rather than adding to
// them. Later roles win, so the most specific comes last.
type ApiRole = {
  files: string[];
  patterns: Pattern[];
  paths: ImportPath[];
  properties: Property[];
};
const API_ROLES: ApiRole[] = [
  {
    files: ["apps/api/{src,test}/**"],
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES],
    paths: [ROUTE_AGENT],
    properties: RUN_EFFECT
  },
  {
    files: ["apps/api/src/common/di/**"],
    patterns: [NO_TEST_FIXTURES],
    paths: [ROUTE_AGENT],
    properties: RUN_EFFECT
  },
  // The edge that runs every program.
  {
    files: ["apps/api/src/app.module.ts"],
    patterns: [NO_TEST_FIXTURES],
    paths: [ROUTE_AGENT],
    properties: []
  },
  {
    files: DOMAIN,
    patterns: [NO_TEST_FIXTURES, ...DOMAIN_IMPORTS],
    paths: [
      ROUTE_AGENT,
      { name: "effect", importNames: ["Schema"], message: EFFECT_SCHEMA_MESSAGE }
    ],
    properties: [...RUN_EFFECT, ...SWALLOW_DEFECTS, BINDINGS]
  },
  {
    files: HTTP,
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...HTTP_IMPORTS],
    paths: [ROUTE_AGENT, HONO_CONTEXT],
    properties: [...RUN_EFFECT, BINDINGS]
  },
  {
    files: PLUMBING,
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...HTTP_IMPORTS, ...PLUMBING_IMPORTS],
    paths: [ROUTE_AGENT],
    properties: [...RUN_EFFECT, BINDINGS]
  },
  // The one caller of routeAgentRequest. Its c.env read stays banned and is disabled with the reason.
  {
    files: ["apps/api/src/modules/chat/chat.controller.ts"],
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...HTTP_IMPORTS],
    paths: [HONO_CONTEXT],
    properties: [...RUN_EFFECT, BINDINGS]
  },
  // Last, so a test beside its source drops that role's bans: tests build fakes as Effect layers,
  // run them, and import #test/ fixtures.
  {
    files: ["apps/api/src/**/*.test.ts", "apps/api/src/**/*.test-d.ts", "apps/api/test/**"],
    patterns: [],
    paths: [ROUTE_AGENT],
    properties: []
  }
];

const apiRole = ({ files, patterns, paths, properties }: ApiRole): OxlintOverride => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { paths, patterns: [...API, ...patterns] }],
    "no-restricted-properties": ["error", ...WORKER_PROPERTIES, ...properties]
  }
});

export default {
  ignorePatterns: ["apps/site/public/**"],
  plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y", "import", "promise"],
  options: { typeAware: true, reportUnusedDisableDirectives: "error" },
  jsPlugins: [
    "./tooling/oxlint/test-behaviour.ts",
    "./tooling/oxlint/contracts.ts",
    "./tooling/oxlint/effect.ts",
    "./tooling/oxlint/astro.ts",
    "./tooling/oxlint/workers.ts",
    "./tooling/oxlint/anti-slop/index.ts",
    "./tooling/oxlint/anti-slop/effect.ts"
  ],
  categories: { correctness: "error" },
  // oxlint takes settings only at the top level; the override below scopes the plugin.
  settings: { tailwindcss: { entryPoint: "apps/site/src/styles/global.css" } },
  rules: {
    "no-irregular-whitespace": ["error", { skipComments: true }],
    "react/no-deriving-state-in-effects": "error",
    "react/no-unstable-nested-components": "error",
    "react/exhaustive-effect-dependencies": "error",
    "react/no-array-index-key": "error",
    "typescript/no-explicit-any": "error",
    "typescript/ban-ts-comment": [
      "error",
      { "ts-expect-error": "allow-with-description", "ts-ignore": true, "ts-nocheck": true }
    ],
    "no-else-return": ["error", { allowElseIf: false }],
    "no-lonely-if": "error",
    "no-shadow": "error",
    eqeqeq: ["error", "always", { null: "ignore" }],
    "unicorn/prefer-array-find": "error",
    "unicorn/prefer-string-replace-all": "error",
    "max-depth": ["error", { max: 3 }],
    "max-params": ["error", { max: 3 }],
    "typescript/no-non-null-assertion": "error",
    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-type-assertion": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unnecessary-type-conversion": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-deprecated": "error",
    "typescript/only-throw-error": "error",
    "typescript/no-misused-promises": "error",
    "typescript/prefer-promise-reject-errors": "error",
    "typescript/use-unknown-in-catch-callback-variable": "error",
    "promise/catch-or-return": "error",
    "promise/no-nesting": "error",
    "promise/no-return-wrap": "error",
    "promise/no-multiple-resolved": "error",
    "promise/no-promise-in-callback": "error",
    "typescript/return-await": "error",
    // `||` on strings is deliberate: a blank value counts as missing.
    "typescript/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
    "import/no-relative-parent-imports": "error",
    "import/no-cycle": "error",
    "oxc/no-accumulating-spread": "error",
    // Vendored from dmmulroy/anti-slop (tooling/oxlint/anti-slop/UPSTREAM.md).
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    // A type guard is where narrowing belongs (AGENTS.md › Code style); anywhere else, parse.
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error"
  },
  overrides: [
    ...LAYER_NAMES.values()
      .filter(name => name !== "api" && name !== "site")
      .map(name =>
        restrict([`${LAYERS[name].dir}**`], [...layerPatterns(name), ...(LAYERS[name].also ?? [])])
      ),
    ...siteRestrict([`${LAYERS.site.dir}**`], SITE),
    ...API_ROLES.map(apiRole),
    // Services log through Effect, so the log carries the span each Effect.fn method opens.
    { files: DOMAIN, rules: { "no-console": "error", "effect/use-fn": "error" } },
    // Where Effect runs (NO_EFFECT bans it elsewhere in the Worker), so Match and Predicate are there.
    {
      files: [...DOMAIN, "apps/api/src/common/di/**", "apps/api/src/app.module.ts"],
      rules: {
        "anti-slop-effect/no-manual-tag-comparison": "error",
        "anti-slop-effect/prefer-effect-match": "error"
      }
    },
    // Shared code serves every page, so it can't reach into a page area's folder.
    ...siteRestrict(
      [
        "apps/site/src/components/*",
        "apps/site/src/components/chat/**",
        "apps/site/src/components/ui/**",
        "apps/site/src/layouts/Layout.astro",
        "apps/site/src/lib/*",
        "apps/site/src/data/**",
        "apps/site/src/directives/**"
      ],
      [
        ...SITE,
        {
          regex:
            "^#src/(components|lib|styles)/(blog|home)/|^#src/layouts/BlogLayout|^\\./(blog|home)/|^\\./BlogLayout",
          message:
            "Shared code can't import from a blog/ or home/ folder. Move the module to the shared folder, or the importer into that area (apps/site/src/README.md › Folders)."
        }
      ]
    ),
    // The homepage may show the blog's posts; the blog never reaches into the homepage.
    ...siteRestrict(
      [
        "apps/site/src/components/blog/**",
        "apps/site/src/lib/blog/**",
        "apps/site/src/styles/blog/**",
        "apps/site/src/layouts/BlogLayout.astro"
      ],
      [
        ...SITE,
        {
          regex: "^#src/components/home/",
          message:
            "Blog code can't import homepage components. Move a component both use to the root of apps/site/src/components (apps/site/src/README.md › Folders)."
        }
      ]
    ),
    // Effect's Service.use and Hono's useApiStack aren't hooks, so React's naming rule stays on
    // the site. oxlint files it under pedantic, which the correctness category leaves off.
    { files: ["apps/site/src/**"], rules: { "react/rules-of-hooks": "error" } },
    { files: ["apps/site/src/**/*.astro"], rules: { "astro/typed-props": "error" } },
    {
      files: ["apps/api/**"],
      rules: {
        // A promise the response doesn't wait for is cancelled with the request, so `void` loses it.
        // Await it, return it, or hand it to ctx.waitUntil with a .catch.
        "typescript/no-floating-promises": ["error", { ignoreVoid: false }]
      }
    },
    {
      files: ["apps/api/src/**"],
      rules: { "workers/no-module-state": "error", "workers/sql-bindings": "error" }
    },
    // A store is the one place per-isolate state lives (apps/api/README.md › Layers).
    { files: ["apps/api/src/**/*.store.ts"], rules: { "workers/no-module-state": "off" } },
    {
      files: ["apps/api/src/**/*.durable-object.ts"],
      rules: {
        // Every public member of a Durable Object is reachable over RPC, so each one says which it is.
        "typescript/explicit-member-accessibility": [
          "error",
          { accessibility: "explicit", overrides: { constructors: "no-public" } }
        ],
        "no-restricted-globals": [
          "error",
          ...["setTimeout", "setInterval"].map(name => ({
            name,
            message:
              "Timers keep a Durable Object from hibernating. Schedule the work with an alarm or the agents SDK's this.schedule() (Cloudflare Durable Objects best practices)."
          }))
        ]
      }
    },
    // oxlint-tailwindcss's recommended set (its README › Setup) plus two rules, all at error.
    // prefer-scale-token turns px into scale steps. no-arbitrary-value keeps values on
    // Tailwind's scale and the theme's tokens; where Tailwind has no default for a value,
    // disable it on that line with the reason. Class order comes from oxfmt (sortTailwindcss).
    {
      files: ["apps/site/src/**/*.{ts,tsx}"],
      jsPlugins: ["oxlint-tailwindcss"],
      rules: {
        "tailwindcss/no-conflicting-classes": "error",
        "tailwindcss/no-contradicting-variants": "error",
        "tailwindcss/no-dark-without-light": "error",
        "tailwindcss/no-duplicate-classes": "error",
        "tailwindcss/no-dynamic-classes": "error",
        "tailwindcss/no-unknown-classes": "error",
        "tailwindcss/enforce-canonical": "error",
        "tailwindcss/enforce-negative-arbitrary-values": "error",
        "tailwindcss/no-deprecated-classes": "error",
        "tailwindcss/no-unnecessary-arbitrary-value": "error",
        "tailwindcss/prefer-scale-token": "error",
        "tailwindcss/consistent-variant-order": "error",
        "tailwindcss/enforce-consistent-important-position": "error",
        "tailwindcss/enforce-consistent-variable-syntax": "error",
        "tailwindcss/enforce-shorthand": "error",
        "tailwindcss/no-unnecessary-whitespace": "error",
        "tailwindcss/no-hardcoded-colors": "error",
        "tailwindcss/no-arbitrary-value": "error",
        // This rule is experimental. It flags a plain element that rebuilds a shadcn primitive from its classes.
        "tailwindcss/no-borrowed-component-styles": [
          "error",
          { components: ["apps/site/src/components/ui"] }
        ],
        "react/forbid-dom-props": [
          "error",
          {
            forbid: [
              {
                propName: "style",
                message:
                  "Style with Tailwind: utilities in className, or an @utility or @theme token in apps/site/src/styles/global.css."
              }
            ]
          }
        ]
      }
    },
    { files: ["packages/contracts/**"], rules: { "contracts/shapes-only": "error" } },
    {
      files: ["**/*.test.{ts,tsx}"],
      plugins: ["vitest"],
      rules: {
        "tests/observe-behaviour": "error",
        "vitest/consistent-test-it": ["error", { fn: "it" }],
        "vitest/no-conditional-expect": "error",
        "vitest/no-standalone-expect": "error",
        // Vitest's expect(value, message) takes a second argument.
        "vitest/valid-expect": ["error", { maxArgs: 2 }],
        "vitest/no-restricted-matchers": [
          "error",
          {
            toBeDefined: "Passes for any value. Assert the literal value (see AGENTS.md › Tests).",
            toBeTruthy:
              "Passes for any value. Assert the literal value, e.g. toBe(true) (see AGENTS.md › Tests).",
            toBeFalsy:
              "Passes for undefined. Assert the literal value, e.g. toBe(false) (see AGENTS.md › Tests).",
            toHaveBeenCalled:
              "Asserts only that a call happened. Assert the payload with toHaveBeenCalledWith or the state after the call (see AGENTS.md › Tests).",
            toHaveBeenCalledTimes:
              "Asserts only that calls happened. Assert the payloads via fn.mock.calls (see AGENTS.md › Tests)."
          }
        ]
      }
    }
  ]
} satisfies OxlintConfig;
