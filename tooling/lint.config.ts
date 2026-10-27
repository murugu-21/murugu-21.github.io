import type { OxlintConfig } from "vite-plus/lint";

type Pattern = { regex: string; message: string; allowTypeImports?: boolean };
type ImportPath = {
  name: string;
  importNames: string[];
  allowTypeImports?: boolean;
  message: string;
};
type Property = { object?: string; property?: string; message: string };
type Global = { name: string; message: string };

type ImportRules = {
  "no-restricted-imports": ["error", { paths?: ImportPath[]; patterns: Pattern[] }];
};
type PropertyRules = { "no-restricted-properties": ["error", ...Property[]] };
type GlobalRules = { "no-restricted-globals": ["error", ...Global[]] };
type Scope = { files: string[]; excludeFiles?: string[] };

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
type Layer = { dir: string; pkg: string; imports?: string; uses: LayerName[]; also?: Pattern[] };

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
    dir: "apps/api/{src,test,e2e}/",
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
const restrict = (scope: Scope, patterns: Pattern[]): Scope & { rules: ImportRules } => ({
  ...scope,
  rules: { "no-restricted-imports": ["error", { patterns }] }
});
const restrictGlobals = (scope: Scope, globals: Global[]): Scope & { rules: GlobalRules } => ({
  ...scope,
  rules: { "no-restricted-globals": ["error", ...globals] }
});
const restrictProperties = (
  scope: Scope,
  properties: Property[]
): Scope & { rules: PropertyRules } => ({
  ...scope,
  rules: { "no-restricted-properties": ["error", ...properties] }
});
// no-restricted-globals sees only the bare name, so the same ban goes on each object it hangs off.
const onObjects = (globals: Global[], objects: string[]): Property[] =>
  objects.flatMap(object =>
    globals.map(({ name, message }) => ({ object, property: name, message }))
  );

const SITE = layerPatterns("site");
const NO_SITE_TEST_FAKES: Pattern = {
  regex: "^#src/test/",
  message:
    "Only tests import the #src/test/ fakes. Production code imports the astro: module the fake stands in for."
};
const SITE_TESTS = ["apps/site/src/**/*.test.ts", "apps/site/src/**/*.test.tsx"];

const AREA_IMPORTS = {
  blog: "^#src/(.*/)?blog/|^#src/layouts/BlogLayout|^\\./blog/|^\\./BlogLayout",
  home: "^#src/(.*/)?home/|^\\./home/"
};
const BLOG_AREA = ["apps/site/src/**/blog/**", "apps/site/src/layouts/BlogLayout.astro"];
const HOME_AREA = ["apps/site/src/**/home/**", "apps/site/src/pages/index.astro"];
const NO_BLOG_OR_HOME: Pattern = {
  regex: `${AREA_IMPORTS.blog}|${AREA_IMPORTS.home}`,
  message:
    "Shared code can't import from a blog/ or home/ folder. Move the module to the shared folder, or the importer into that area (apps/site/src/README.md › Folders)."
};
const NO_HOME: Pattern = {
  regex: AREA_IMPORTS.home,
  message:
    "Blog code can't import homepage components. Move a component both use to the root of apps/site/src/components (apps/site/src/README.md › Folders)."
};
const siteSources = (files: string[], patterns: Pattern[]) =>
  restrict({ files, excludeFiles: SITE_TESTS }, [...SITE, NO_SITE_TEST_FAKES, ...patterns]);
const SITE_OVERRIDES = [
  restrict({ files: ["apps/site/src/**"] }, SITE),
  siteSources(["apps/site/src/**"], [NO_BLOG_OR_HOME]),
  siteSources(BLOG_AREA, [NO_HOME]),
  siteSources(HOME_AREA, [])
];

const PROCESS_ARGV: Property = {
  object: "process",
  property: "argv",
  message:
    "Read the command line with parseArgs from node:util, which takes process.argv by default and validates the options (Node.js › util.parseArgs)."
};
const PROCESS_ENV: Property = {
  object: "process",
  property: "env",
  message:
    "process.env is read in one place: apps/site/build-env.ts for the site build, and the vars and bindings in apps/api/wrangler.jsonc for the Worker. Declare the variable there (README.md › Build settings)."
};
const STORAGE: Global[] = ["localStorage", "sessionStorage"].map(name => ({
  name,
  message:
    "Storage throws where the browser blocks it. Go through readStored and writeStored in apps/site/src/lib/storage.ts, which catch that."
}));
const STORAGE_CALLERS: Scope = {
  files: ["apps/site/src/**"],
  excludeFiles: ["apps/site/src/lib/storage.ts", ...SITE_TESTS]
};

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

const NO_WORKER_ENV: Pattern = {
  regex: "/di/worker-env\\.ts$",
  message:
    "Bindings reach Effect only through repositories and integration services (apps/api/README.md › Layers)."
};
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
  NO_WORKER_ENV
];
const ROLE_SUFFIXES = [
  "controller",
  "tools",
  "resources",
  "guard",
  "pipe",
  "interceptor",
  "middleware",
  "filter",
  "service",
  "repository",
  "store",
  "client",
  "durable-object"
];
const PURE_IMPORTS: Pattern[] = [
  {
    regex: `\\.(${ROLE_SUFFIXES.join("|")})\\.ts$|^#src/app\\.module\\.ts$`,
    allowTypeImports: true,
    message:
      "A file with no role suffix holds pure functions and constants, so it imports no file that has one (type imports are fine). Give it the suffix of the role it plays, or move the call into that role (apps/api/README.md › Layers)."
  },
  NO_WORKER_ENV
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
const ENV_BINDINGS: Property = { object: "env", message: BINDINGS.message };
const FETCH: Global = {
  name: "fetch",
  message:
    "Only a *.client.ts calls fetch. Put the call in a client and reach it through a repository or integration service (apps/api/README.md › Layers)."
};

const bySuffix = (...suffixes: string[]) => suffixes.map(s => `apps/api/src/**/*.${s}.ts`);
const DOMAIN = bySuffix("service", "repository");
const HTTP = bySuffix("controller", "tools", "resources");
const PLUMBING = bySuffix("guard", "pipe", "interceptor", "middleware", "filter");

// An override replaces a rule's options rather than adding to them, so each list is whole.
// Later roles win, so the most specific comes last.
type ApiRole = Scope & {
  patterns: Pattern[];
  paths: ImportPath[];
  properties: Property[];
  globals: Global[];
};
const DECODES_ENTITIES_TO_TEXT = ["apps/api/src/modules/chat/fetch-page.client.ts"];
const SHIPS_SCHEMAS_WITHOUT_ZOD = ["apps/site/src/lib/webmcp.ts"];
const SHOWS_A_CONVERTED_SCHEMA = ["apps/site/src/pages/developers.astro"];
const VENDORED_RULES = ["tooling/oxlint/anti-slop/**"];

const WORKER_ENTRY_POINTS = [
  "apps/api/src/app.ts",
  "apps/api/src/app.module.ts",
  "apps/api/src/server.ts"
];

const PURE_ROLE: ApiRole = {
  files: ["apps/api/src/**/*.ts"],
  excludeFiles: [...bySuffix(...ROLE_SUFFIXES), ...WORKER_ENTRY_POINTS],
  patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...PURE_IMPORTS],
  paths: [ROUTE_AGENT],
  properties: [...RUN_EFFECT, BINDINGS, ENV_BINDINGS],
  globals: [FETCH]
};

const API_ROLES: ApiRole[] = [
  {
    files: ["apps/api/{src,test,e2e}/**"],
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES],
    paths: [ROUTE_AGENT],
    properties: RUN_EFFECT,
    globals: []
  },
  PURE_ROLE,
  {
    files: ["apps/api/src/common/di/**"],
    patterns: [NO_TEST_FIXTURES],
    paths: [ROUTE_AGENT],
    properties: RUN_EFFECT,
    globals: []
  },
  {
    files: ["apps/api/src/app.module.ts"],
    patterns: [NO_TEST_FIXTURES],
    paths: [ROUTE_AGENT],
    properties: [],
    globals: []
  },
  {
    files: DOMAIN,
    patterns: [NO_TEST_FIXTURES, ...DOMAIN_IMPORTS],
    paths: [
      ROUTE_AGENT,
      { name: "effect", importNames: ["Schema"], message: EFFECT_SCHEMA_MESSAGE }
    ],
    properties: [...RUN_EFFECT, ...SWALLOW_DEFECTS, BINDINGS],
    globals: [FETCH]
  },
  {
    files: HTTP,
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...HTTP_IMPORTS],
    paths: [ROUTE_AGENT, HONO_CONTEXT],
    properties: [...RUN_EFFECT, BINDINGS],
    globals: [FETCH]
  },
  {
    files: PLUMBING,
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...HTTP_IMPORTS, ...PLUMBING_IMPORTS],
    paths: [ROUTE_AGENT],
    properties: [...RUN_EFFECT, BINDINGS],
    globals: [FETCH]
  },
  {
    files: ["apps/api/src/modules/chat/chat.controller.ts"],
    patterns: [...NO_EFFECT, NO_TEST_FIXTURES, ...HTTP_IMPORTS],
    paths: [HONO_CONTEXT],
    properties: [...RUN_EFFECT, BINDINGS],
    globals: [FETCH]
  },
  // Last, so a test beside its source drops that role's bans: tests build fakes as Effect layers,
  // run them, and import #test/ fixtures.
  {
    files: [
      "apps/api/src/**/*.test.ts",
      "apps/api/src/**/*.test-d.ts",
      "apps/api/test/**",
      "apps/api/e2e/**"
    ],
    patterns: [],
    paths: [ROUTE_AGENT],
    properties: [],
    globals: []
  }
];

const apiRole = ({
  files,
  excludeFiles = [],
  patterns,
  paths,
  properties,
  globals
}: ApiRole): Scope & { rules: ImportRules & PropertyRules & GlobalRules } => ({
  files,
  excludeFiles,
  rules: {
    "no-restricted-imports": ["error", { paths, patterns: [...API, ...patterns] }],
    "no-restricted-properties": [
      "error",
      PROCESS_ARGV,
      PROCESS_ENV,
      ...WORKER_PROPERTIES,
      ...properties,
      ...onObjects(globals, ["globalThis"])
    ],
    "no-restricted-globals": ["error", ...globals]
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
    "./tooling/oxlint/primitives.ts",
    "./tooling/oxlint/anti-slop/index.ts",
    "./tooling/oxlint/anti-slop/effect.ts"
  ],
  categories: { correctness: "error" },
  // oxlint takes settings only at the top level; the override below scopes the plugin.
  // variablePatterns adds to the plugin's defaults (className, classes, styles).
  settings: {
    tailwindcss: { entryPoint: "apps/site/src/styles/global.css", variablePatterns: ["Classes$"] }
  },
  rules: {
    "no-irregular-whitespace": ["error", { skipComments: true }],
    "no-restricted-properties": ["error", PROCESS_ARGV],
    "primitives/json-schema-literal": "error",
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
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
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
        restrict({ files: [`${LAYERS[name].dir}**`] }, [
          ...layerPatterns(name),
          ...(LAYERS[name].also ?? [])
        ])
      ),
    ...SITE_OVERRIDES,
    restrictProperties({ files: ["apps/site/src/**", "packages/**"] }, [PROCESS_ARGV, PROCESS_ENV]),
    restrictProperties(STORAGE_CALLERS, [
      PROCESS_ARGV,
      PROCESS_ENV,
      ...onObjects(STORAGE, ["window", "globalThis"])
    ]),
    restrictGlobals(STORAGE_CALLERS, STORAGE),
    {
      files: ["apps/site/src/**", "apps/api/src/**", "packages/**"],
      excludeFiles: ["**/*.test.{ts,tsx}", ...DECODES_ENTITIES_TO_TEXT],
      rules: { "primitives/html-entity-literal": "error" }
    },
    {
      files: [
        ...SHIPS_SCHEMAS_WITHOUT_ZOD,
        ...SHOWS_A_CONVERTED_SCHEMA,
        ...VENDORED_RULES,
        "**/*.test.{ts,tsx}"
      ],
      rules: { "primitives/json-schema-literal": "off" }
    },
    ...API_ROLES.map(apiRole),
    { files: DOMAIN, rules: { "no-console": "error", "effect/use-fn": "error" } },
    {
      files: [...DOMAIN, "apps/api/src/common/di/**", "apps/api/src/app.module.ts"],
      rules: {
        "anti-slop-effect/no-manual-tag-comparison": "error",
        "anti-slop-effect/prefer-effect-match": "error"
      }
    },
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
    { files: ["apps/api/src/**/*.store.ts"], rules: { "workers/no-module-state": "off" } },
    {
      files: ["apps/api/src/**/*.durable-object.ts"],
      rules: {
        // Every public member of a Durable Object is reachable over RPC, so each one says which it is.
        "typescript/explicit-member-accessibility": [
          "error",
          { accessibility: "explicit", overrides: { constructors: "no-public" } }
        ]
      }
    },
    restrictGlobals(
      { files: ["apps/api/src/**/*.durable-object.ts"] },
      ["setTimeout", "setInterval"].map(name => ({
        name,
        message:
          "Timers keep a Durable Object from hibernating. Schedule the work with an alarm or the agents SDK's this.schedule() (Cloudflare Durable Objects best practices)."
      }))
    ),
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
            toBeDefined:
              "Passes for any value. Assert the literal value (see CODING_STANDARDS.md › Tests).",
            toBeTruthy:
              "Passes for any value. Assert the literal value, e.g. toBe(true) (see CODING_STANDARDS.md › Tests).",
            toBeFalsy:
              "Passes for undefined. Assert the literal value, e.g. toBe(false) (see CODING_STANDARDS.md › Tests).",
            toHaveBeenCalled:
              "Asserts only that a call happened. Assert the payload with toHaveBeenCalledWith or the state after the call (see CODING_STANDARDS.md › Tests).",
            toHaveBeenCalledTimes:
              "Asserts only that calls happened. Assert the payloads via fn.mock.calls (see CODING_STANDARDS.md › Tests)."
          }
        ]
      }
    }
  ]
} satisfies OxlintConfig;
