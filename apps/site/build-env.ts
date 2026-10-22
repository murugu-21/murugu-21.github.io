import { envField } from "astro/config";

export const ENV_SCHEMA = {
  PUBLIC_CHAT_HOST: envField.string({ context: "client", access: "public", optional: true }),
  PUBLIC_TURNSTILE_SITE_KEY: envField.string({
    context: "client",
    access: "public",
    optional: true
  }),
  // Written into page meta tags, so only the public phc_ key belongs here, never the phx_ one.
  POST_HOG_TOKEN: envField.string({
    context: "server",
    access: "public",
    optional: true,
    startsWith: "phc_"
  }),
  POST_HOG_URL: envField.string({
    context: "server",
    access: "public",
    optional: true,
    url: true
  }),
  GITHUB_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
  REQUIRE_GITHUB_PROFILE: envField.enum({
    context: "server",
    access: "public",
    values: ["0", "1"],
    default: "0"
  }),
  RESUME_PHONE: envField.string({ context: "server", access: "secret", optional: true })
};

const SOURCE_MAP_ENV = {
  personalApiKey: "POSTHOG_API_KEY",
  projectId: "POSTHOG_PROJECT_ID"
} as const;

export const sourceMapUpload = {
  personalApiKey: process.env[SOURCE_MAP_ENV.personalApiKey]?.trim(),
  projectId: process.env[SOURCE_MAP_ENV.projectId]?.trim()
};

// Cloudflare Workers Builds sets WORKERS_CI=1.
const DEPLOY_BUILD_ENV = "WORKERS_CI";

export const BUILD_ENV_NAMES = [
  ...Object.keys(ENV_SCHEMA),
  ...Object.values(SOURCE_MAP_ENV),
  DEPLOY_BUILD_ENV
];

export function requireDeployEnv(env: Record<string, string | undefined>): void {
  if (env[DEPLOY_BUILD_ENV] !== "1" || env.PUBLIC_TURNSTILE_SITE_KEY?.trim()) return;
  throw new Error(
    "PUBLIC_TURNSTILE_SITE_KEY is unset in Workers Builds, so the deployed chat would refuse every visitor"
  );
}
